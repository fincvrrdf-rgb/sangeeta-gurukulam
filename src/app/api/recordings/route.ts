/**
 * API: GET/POST /api/recordings
 *
 * Practice recordings management.
 * - GET: List recordings (student sees own, teacher filters by studentId query param)
 * - POST: Student submits recording metadata after upload to Firebase Storage
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { createDoc, queryDocs, nowISO } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';
import { writeAuditLog, extractRequestMeta } from '@/services/audit/log';
import { z } from 'zod';

const SubmitRecordingSchema = z.object({
  teachingUnitId: z.string().min(1),
  storagePath: z.string().min(1),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  fileSizeBytes: z.number().int().positive(),
  durationSeconds: z.number().positive(),
  consentGiven: z.literal(true),
});

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);

    const { searchParams } = new URL(request.url);
    const studentId = auth.role === 'student' ? auth.uid : searchParams.get('studentId');

    const filters: { type: 'where'; field: string; op: '=='; value: string }[] = [];
    if (studentId) {
      filters.push({ type: 'where', field: 'studentId', op: '==', value: studentId });
    }

    const recordings = await queryDocs(COLLECTIONS.PRACTICE_RECORDINGS, [
      ...filters,
      { type: 'orderBy', field: 'createdAt', direction: 'desc' },
    ]);

    return Response.json({ recordings });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['student']);
    const body = await request.json();
    const parsed = SubmitRecordingSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const { teachingUnitId, storagePath, fileName, mimeType, fileSizeBytes, durationSeconds } = parsed.data;

    const recordingId = await createDoc(COLLECTIONS.PRACTICE_RECORDINGS, {
      studentId: auth.uid,
      teachingUnitId,
      storagePath,
      fileName,
      mimeType,
      fileSizeBytes,
      durationSeconds,
      consentGiven: true,
      status: 'submitted',
      submittedAt: nowISO(),
    });

    const { ipAddress, userAgent } = extractRequestMeta(request);
    await writeAuditLog({
      actorId: auth.uid,
      actorRole: auth.role,
      action: 'RECORDING_SUBMITTED',
      entityType: 'practice_recording',
      entityId: recordingId,
      newState: { teachingUnitId, fileName, status: 'submitted' },
      ipAddress,
      userAgent,
    });

    return Response.json({ success: true, recordingId });
  } catch (error) {
    return authErrorResponse(error);
  }
}
