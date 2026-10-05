/**
 * API: GET /api/payment/proof/[id]
 *
 * One payment proof for the teacher's review page, with a short-lived link to
 * view the uploaded file (Supabase for new uploads, Firebase for older ones).
 * Teacher / admin, or the student who uploaded it.
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { getDoc } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';
import { fileLinkFor } from '@/lib/storage/file-links';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireAuth(request, ['student', 'teacher', 'super_admin']);
    const proof = await getDoc<Record<string, unknown> & { id: string }>(COLLECTIONS.PAYMENT_PROOF_UPLOADS, params.id);
    if (!proof) return Response.json({ error: 'Payment proof not found' }, { status: 404 });
    if (auth.role === 'student' && proof.studentId !== auth.uid) {
      return Response.json({ error: 'Access denied' }, { status: 403 });
    }

    const studentId = String(proof.studentId ?? '');
    const [profile, extraction, fileUrl] = await Promise.all([
      studentId ? getDoc<Record<string, unknown>>(COLLECTIONS.STUDENT_PROFILES, studentId) : null,
      proof.aiExtractionId
        ? getDoc<Record<string, unknown>>(COLLECTIONS.PAYMENT_AI_EXTRACTIONS, String(proof.aiExtractionId))
        : null,
      fileLinkFor({
        provider: proof.storageProvider as string | undefined,
        bucket: 'payment-proofs',
        path: String(proof.storageRef ?? ''),
      }),
    ]);

    return Response.json({
      id: proof.id,
      studentId,
      studentName: (profile?.fullName as string) || 'Student',
      cycleMonth: proof.cycleMonth,
      submittedAt: proof.uploadedAt ?? proof.createdAt,
      fileType: proof.mimeType ?? '',
      fileName: proof.fileName ?? '',
      fileUrl: fileUrl ?? undefined,
      status: proof.status,
      aiExtraction: extraction ?? undefined,
      reviewerNotes: (proof.reviewNotes as string) ?? undefined,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
