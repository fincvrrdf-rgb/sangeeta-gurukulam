/**
 * API: POST /api/recordings/upload
 *
 * Server-side upload of a practice-recording audio blob to Supabase Storage
 * (free tier) — replaces Firebase Storage, which was rejecting uploads due to
 * bucket IAM/rules issues on this project.
 *
 * Flow: client sends the raw audio blob with metadata headers; we verify the
 * Firebase ID token (auth stays on Firebase), then store the file with the
 * service-role key. Files live in a PRIVATE bucket; playback goes through
 * short-lived signed URLs generated in /api/recordings/[id].
 *
 * The client must send:
 *   Authorization: Bearer <firebase idToken>
 *   Content-Type: <audio mimeType>
 *   x-teaching-unit-id: <id>
 *   x-week-of: <YYYY-WW>
 *   x-file-name: <timestamp.ext>
 *   Body: raw audio blob
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { STORAGE_PATHS } from '@/domain/constants';
import { supabaseConfigured, uploadToSupabase } from '@/lib/storage/supabase';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['student', 'teacher', 'super_admin']);

    const teachingUnitId = request.headers.get('x-teaching-unit-id');
    const weekOf = request.headers.get('x-week-of');
    const fileName = request.headers.get('x-file-name');
    const contentType = request.headers.get('content-type') || 'audio/webm';

    if (!teachingUnitId || !weekOf || !fileName) {
      return Response.json(
        { error: 'Missing required headers: x-teaching-unit-id, x-week-of, x-file-name' },
        { status: 400 },
      );
    }

    if (!supabaseConfigured()) {
      return Response.json(
        {
          error:
            'Storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY ' +
            'environment variables (free account at supabase.com) and create a private ' +
            '"recordings" bucket. See docs/STORAGE_SETUP.md.',
        },
        { status: 503 },
      );
    }

    const buffer = Buffer.from(await request.arrayBuffer());
    if (buffer.length === 0) {
      return Response.json({ error: 'Empty file body' }, { status: 400 });
    }
    if (buffer.length > 50 * 1024 * 1024) {
      return Response.json({ error: 'File too large (max 50 MB)' }, { status: 413 });
    }

    const storagePath = STORAGE_PATHS.recording(auth.uid, teachingUnitId, weekOf, fileName);
    await uploadToSupabase(storagePath, buffer, contentType);

    return Response.json({ success: true, storagePath, storageProvider: 'supabase' });
  } catch (error) {
    return authErrorResponse(error);
  }
}
