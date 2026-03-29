/**
 * API: /api/payment/proof
 *
 * GET  — List payment proof uploads (student: own, teacher/admin: all)
 * POST — Student submits payment proof metadata after uploading file to Firebase Storage
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { createDoc, queryDocs, nowISO } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';
import { writeAuditLog, extractRequestMeta } from '@/services/audit/log';
import { markProofSubmitted } from '@/services/payment/status';
import type { PaymentProofUpload } from '@/domain/types';
import { z } from 'zod';

const PaymentProofSchema = z.object({
  cycleMonth: z.string().regex(/^\d{4}-\d{2}$/, 'Must be YYYY-MM format'),
  storagePath: z.string().min(1),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  fileSizeBytes: z.number().int().positive(),
  notes: z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['student', 'teacher', 'super_admin']);

    const constraints =
      auth.role === 'student'
        ? [{ type: 'where' as const, field: 'studentId', op: '==' as const, value: auth.uid }]
        : [];

    const proofs = await queryDocs<PaymentProofUpload>(COLLECTIONS.PAYMENT_PROOF_UPLOADS, [
      ...constraints,
      { type: 'orderBy', field: 'uploadedAt', direction: 'desc' },
    ]);

    return Response.json({ proofs });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['student']);
    const body = await request.json();
    const parsed = PaymentProofSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const { cycleMonth, storagePath, fileName, mimeType, fileSizeBytes, notes } = parsed.data;

    // Create payment proof upload record
    const proofId = await createDoc(COLLECTIONS.PAYMENT_PROOF_UPLOADS, {
      studentId: auth.uid,
      cycleMonth,
      uploadedAt: nowISO(),
      storageRef: storagePath,
      fileName,
      mimeType,
      fileSizeBytes,
      status: 'submitted',
      reviewedBy: null,
      reviewedAt: null,
      reviewNotes: null,
      aiExtractionId: null,
      deletedAt: null,
      deletedBy: null,
      notes: notes ?? null,
    });

    // Update monthly payment status to proof_submitted
    await markProofSubmitted(auth.uid, cycleMonth, proofId, auth.uid);

    // Audit log
    const { ipAddress, userAgent } = extractRequestMeta(request);
    await writeAuditLog({
      actorId: auth.uid,
      actorRole: auth.role,
      action: 'PAYMENT_PROOF_SUBMITTED',
      entityType: 'payment_proof_upload',
      entityId: proofId,
      newState: { cycleMonth, storagePath, fileName, mimeType, fileSizeBytes },
      ipAddress,
      userAgent,
    });

    return Response.json({ success: true, proofId });
  } catch (error) {
    return authErrorResponse(error);
  }
}
