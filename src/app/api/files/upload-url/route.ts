/**
 * API: POST /api/files/upload-url
 *
 * Step 1 of uploading a file to Supabase Storage straight from the browser
 * (bypasses our server's request-size limit). The server picks the path, so
 * users can only write where they're allowed:
 *   kind 'lyrics'   → materials/lyrics/{lyricsId}/…      (teacher/admin; public file)
 *   kind 'resource' → materials/resources/{uid}/…        (teacher/admin; public file)
 *   kind 'payment'  → payment-proofs/{uid}/{cycleMonth}/… (student; private)
 *   kind 'recording' → recordings/recordings/{uid}/{unit}/{weekOf}/… (anyone, own folder; private)
 * Returns { uploadUrl, bucket, path, publicUrl? }. The browser PUTs the file to
 * uploadUrl, then saves bucket/path (and publicUrl) with the record.
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { BUCKETS, createSignedUploadUrl, supabaseConfigured, supabasePublicUrl } from '@/lib/storage/supabase';
import { STORAGE_PATHS } from '@/domain/constants';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const Schema = z.object({
  kind: z.enum(['lyrics', 'resource', 'payment', 'recording']),
  fileName: z.string().min(1).max(200),
  lyricsId: z.string().regex(/^[\w-]+$/).optional(),
  cycleMonth: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  teachingUnitId: z.string().regex(/^[\w-]+$/).optional(),
  weekOf: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});

function safeName(name: string): string {
  const cleaned = name.normalize('NFKD').replace(/[^\w.\-]+/g, '_').replace(/_+/g, '_');
  return `${Date.now()}_${cleaned.slice(-120) || 'file'}`;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['student', 'teacher', 'super_admin']);
    const parsed = Schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return Response.json({ error: 'Invalid request' }, { status: 400 });
    if (!supabaseConfigured()) {
      return Response.json(
        { error: 'File storage is not set up yet (SUPABASE_SERVICE_ROLE_KEY missing on the server).' },
        { status: 503 },
      );
    }

    const { kind, fileName, lyricsId, cycleMonth, teachingUnitId, weekOf } = parsed.data;
    const isStaff = auth.role === 'teacher' || auth.role === 'super_admin';
    let bucket: string;
    let path: string;

    if (kind === 'recording') {
      if (!weekOf) return Response.json({ error: 'weekOf is required' }, { status: 400 });
      bucket = BUCKETS.recordings;
      path = STORAGE_PATHS.recording(auth.uid, teachingUnitId || 'general', weekOf, safeName(fileName));
    } else if (kind === 'payment') {
      if (auth.role !== 'student') return Response.json({ error: 'Only students upload payment proofs' }, { status: 403 });
      if (!cycleMonth) return Response.json({ error: 'cycleMonth is required' }, { status: 400 });
      bucket = BUCKETS.paymentProofs;
      path = `${auth.uid}/${cycleMonth}/${safeName(fileName)}`;
    } else {
      if (!isStaff) return Response.json({ error: 'Not allowed' }, { status: 403 });
      bucket = BUCKETS.materials;
      if (kind === 'lyrics') {
        if (!lyricsId) return Response.json({ error: 'lyricsId is required' }, { status: 400 });
        path = `lyrics/${lyricsId}/${safeName(fileName)}`;
      } else {
        path = `resources/${auth.uid}/${safeName(fileName)}`;
      }
    }

    const uploadUrl = await createSignedUploadUrl(bucket, path);
    return Response.json({
      uploadUrl,
      bucket,
      path,
      publicUrl: bucket === BUCKETS.materials ? supabasePublicUrl(bucket, path) : null,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
