/**
 * API: POST /api/files/direct-upload
 *
 * Starts an upload of a student's assessment video or practice recording
 * straight into Firebase Storage. The server opens a resumable upload
 * session for a path it chooses (the student's own folder) and returns the
 * session URL; the browser PUTs the file to it directly, so neither our
 * request-size limit nor the Storage security rules / size caps get in the
 * way. Body: { kind, fileName, contentType, size, assessmentId? |
 * teachingUnitId? + weekOf? }. Returns { uploadUrl, path }.
 */

import { NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { adminStorage } from '@/lib/firebase/admin';
import { ASSESSMENT_MAX_SIZE_BYTES, STORAGE_PATHS } from '@/domain/constants';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const RECORDING_MAX_BYTES = 100 * 1024 * 1024;

const Schema = z.object({
  kind: z.enum(['assessment', 'recording']),
  fileName: z.string().min(1).max(200),
  contentType: z.string().max(100).optional(),
  size: z.number().int().positive(),
  assessmentId: z.string().regex(/^[\w-]+$/).optional(),
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
    if (!parsed.success) return Response.json({ error: 'Invalid upload request' }, { status: 400 });
    const { kind, fileName, size, assessmentId, teachingUnitId, weekOf } = parsed.data;
    const contentType = parsed.data.contentType || (kind === 'assessment' ? 'video/mp4' : 'audio/webm');

    let path: string;
    if (kind === 'assessment') {
      if (!assessmentId) return Response.json({ error: 'assessmentId is required' }, { status: 400 });
      if (!contentType.startsWith('video/')) {
        return Response.json({ error: 'Please choose a video file — your taalam needs to be visible.' }, { status: 400 });
      }
      if (size > ASSESSMENT_MAX_SIZE_BYTES) {
        return Response.json({ error: `Please keep the video under ${Math.round(ASSESSMENT_MAX_SIZE_BYTES / 1024 / 1024)} MB.` }, { status: 413 });
      }
      path = STORAGE_PATHS.assessmentVideo(auth.uid, assessmentId, safeName(fileName));
    } else {
      if (!weekOf) return Response.json({ error: 'weekOf is required' }, { status: 400 });
      if (size > RECORDING_MAX_BYTES) {
        return Response.json({ error: 'Please keep the recording under 100 MB.' }, { status: 413 });
      }
      path = STORAGE_PATHS.recording(auth.uid, teachingUnitId || 'general', weekOf, safeName(fileName));
    }

    // The session only accepts uploads from the page that asked for it
    const origin = request.headers.get('origin')
      || (request.headers.get('host') ? `https://${request.headers.get('host')}` : undefined);

    const [uploadUrl] = await adminStorage.bucket().file(path).createResumableUpload({
      origin,
      metadata: {
        contentType,
        // Lets the Firebase client SDK's getDownloadURL work for this file too
        metadata: { firebaseStorageDownloadTokens: randomUUID() },
      },
    });

    return Response.json({ uploadUrl, path, contentType });
  } catch (error) {
    if (error instanceof Error && !('statusCode' in error)) {
      console.error('[DIRECT_UPLOAD]', error);
      return Response.json({ error: `Could not start the upload: ${error.message}` }, { status: 500 });
    }
    return authErrorResponse(error);
  }
}
