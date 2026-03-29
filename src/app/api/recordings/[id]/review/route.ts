/**
 * API: POST /api/recordings/[id]/review
 *
 * Teacher reviews a student's practice recording.
 * Creates a recording_reviews doc and updates the recording status.
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { createDoc, getDoc, updateDoc, nowISO } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';
import { writeAuditLog, extractRequestMeta } from '@/services/audit/log';
import { z } from 'zod';

const ReviewRecordingSchema = z.object({
  status: z.enum(['accepted', 'needs_improvement', 'rejected']),
  feedback: z.string().optional(),
  scores: z.record(z.string(), z.number()).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(request, ['teacher', 'super_admin']);
    const { id: recordingId } = params;
    const body = await request.json();
    const parsed = ReviewRecordingSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const recording = await getDoc(COLLECTIONS.PRACTICE_RECORDINGS, recordingId);
    if (!recording) {
      return Response.json({ error: 'Recording not found' }, { status: 404 });
    }

    const { status, feedback, scores } = parsed.data;

    // Create review document
    const reviewId = await createDoc(COLLECTIONS.RECORDING_REVIEWS, {
      recordingId,
      reviewerId: auth.uid,
      studentId: (recording as Record<string, unknown>).studentId,
      teachingUnitId: (recording as Record<string, unknown>).teachingUnitId,
      status,
      feedback: feedback ?? null,
      scores: scores ?? null,
      reviewedAt: nowISO(),
    });

    // Update recording status
    await updateDoc(COLLECTIONS.PRACTICE_RECORDINGS, recordingId, {
      status,
      lastReviewId: reviewId,
      lastReviewedAt: nowISO(),
      lastReviewedBy: auth.uid,
    });

    // Audit log
    const { ipAddress, userAgent } = extractRequestMeta(request);
    await writeAuditLog({
      actorId: auth.uid,
      actorRole: auth.role,
      action: 'RECORDING_REVIEWED',
      entityType: 'recording_review',
      entityId: reviewId,
      newState: { recordingId, status, feedback: feedback ?? null },
      ipAddress,
      userAgent,
    });

    return Response.json({ success: true, reviewId, status });
  } catch (error) {
    return authErrorResponse(error);
  }
}
