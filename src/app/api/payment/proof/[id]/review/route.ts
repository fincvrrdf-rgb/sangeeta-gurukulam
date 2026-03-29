/**
 * API: POST /api/payment/proof/[id]/review
 *
 * Teacher or admin reviews (approves or rejects) a payment proof upload.
 * On approval, marks the corresponding monthly payment as paid.
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { getDoc, updateDoc, nowISO } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';
import { writeAuditLog, extractRequestMeta } from '@/services/audit/log';
import { markPaid } from '@/services/payment/status';
import type { PaymentProofUpload } from '@/domain/types';
import { z } from 'zod';

const ReviewSchema = z.object({
  action: z.enum(['approve', 'reject']),
  notes: z.string().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request, ['teacher', 'super_admin']);
    const { id } = await params;
    const body = await request.json();
    const parsed = ReviewSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const { action, notes } = parsed.data;

    // Load existing proof
    const proof = await getDoc<PaymentProofUpload>(COLLECTIONS.PAYMENT_PROOF_UPLOADS, id);

    if (!proof) {
      return Response.json({ error: 'Payment proof not found' }, { status: 404 });
    }

    if (proof.status !== 'pending_review') {
      return Response.json({ error: `Proof has already been ${proof.status}` }, { status: 400 });
    }

    const newStatus = action === 'approve' ? 'accepted' : 'rejected';

    // Update proof record
    await updateDoc(COLLECTIONS.PAYMENT_PROOF_UPLOADS, id, {
      status: newStatus,
      reviewedBy: auth.uid,
      reviewedAt: nowISO(),
      reviewNotes: notes ?? null,
    });

    // If approved, mark payment as paid
    if (action === 'approve') {
      await markPaid(proof.studentId, proof.cycleMonth, auth.uid, notes ?? 'Payment proof approved');
    }

    // Audit log
    const { ipAddress, userAgent } = extractRequestMeta(request);
    await writeAuditLog({
      actorId: auth.uid,
      actorRole: auth.role,
      action: 'PAYMENT_PROOF_REVIEWED',
      entityType: 'payment_proof_upload',
      entityId: id,
      previousState: { status: proof.status },
      newState: { status: newStatus, reviewNotes: notes ?? null },
      ipAddress,
      userAgent,
    });

    return Response.json({ success: true, status: newStatus });
  } catch (error) {
    return authErrorResponse(error);
  }
}
