/**
 * API: POST /api/recordings/[id]/pitch-check
 *
 * Run AI pitch analysis on a practice recording.
 * Placeholder: creates a pitch_check_results doc with status 'pending'.
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { createDoc, getDoc, nowISO } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';
import { writeAuditLog, extractRequestMeta } from '@/services/audit/log';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(request, ['teacher', 'super_admin']);
    const { id: recordingId } = params;

    const recording = await getDoc(COLLECTIONS.PRACTICE_RECORDINGS, recordingId);
    if (!recording) {
      return Response.json({ error: 'Recording not found' }, { status: 404 });
    }

    const rec = recording as Record<string, unknown>;

    // Create a pending pitch check result (placeholder for AI pipeline)
    const pitchCheckId = await createDoc(COLLECTIONS.PITCH_CHECK_RESULTS, {
      recordingId,
      studentId: rec.studentId,
      teachingUnitId: rec.teachingUnitId,
      storagePath: rec.storagePath,
      status: 'pending',
      requestedBy: auth.uid,
      requestedAt: nowISO(),
      results: null,
      errorMessage: null,
    });

    const { ipAddress, userAgent } = extractRequestMeta(request);
    await writeAuditLog({
      actorId: auth.uid,
      actorRole: auth.role,
      action: 'PITCH_CHECK_REQUESTED',
      entityType: 'pitch_check_result',
      entityId: pitchCheckId,
      newState: { recordingId, status: 'pending' },
      ipAddress,
      userAgent,
    });

    return Response.json({ success: true, pitchCheckId, status: 'pending' });
  } catch (error) {
    return authErrorResponse(error);
  }
}
