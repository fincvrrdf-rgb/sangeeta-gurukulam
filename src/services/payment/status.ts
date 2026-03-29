/**
 * services/payment/status.ts
 *
 * Payment status management — reading, updating, and waiving payments.
 * Handles the full lifecycle: optional → compulsory → proof_submitted → paid/waived.
 */

import { getDoc, updateDoc, queryDocs, nowISO, type QueryConstraint } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';
import type { MonthlyPaymentStatus, PaymentAuditEntry } from '@/domain/types';

/**
 * Get payment status for a student in a given cycle.
 */
export async function getPaymentStatus(
  studentId: string,
  cycleMonth: string
): Promise<MonthlyPaymentStatus | null> {
  const id = `${studentId}_${cycleMonth}`;
  return getDoc<MonthlyPaymentStatus>(COLLECTIONS.MONTHLY_PAYMENT_STATUS, id);
}

/**
 * Get all payment statuses for a student (history).
 */
export async function getPaymentHistory(studentId: string): Promise<MonthlyPaymentStatus[]> {
  return queryDocs<MonthlyPaymentStatus>(COLLECTIONS.MONTHLY_PAYMENT_STATUS, [
    { type: 'where', field: 'studentId', op: '==', value: studentId },
    { type: 'orderBy', field: 'cycleMonth', direction: 'desc' },
  ]);
}

/**
 * Mark payment as proof submitted (after student uploads proof).
 */
export async function markProofSubmitted(
  studentId: string,
  cycleMonth: string,
  proofUploadId: string,
  actorId: string
): Promise<void> {
  const id = `${studentId}_${cycleMonth}`;
  const existing = await getDoc<MonthlyPaymentStatus>(COLLECTIONS.MONTHLY_PAYMENT_STATUS, id);

  const newEntry: PaymentAuditEntry = {
    action: 'PROOF_SUBMITTED',
    actorId,
    timestamp: nowISO(),
    notes: `Proof upload: ${proofUploadId}`,
  };

  await updateDoc(COLLECTIONS.MONTHLY_PAYMENT_STATUS, id, {
    status: 'proof_submitted',
    proofUploadId,
    auditTrail: [...(existing?.auditTrail ?? []), newEntry],
  });
}

/**
 * Mark payment as paid (after teacher/admin reviews proof).
 */
export async function markPaid(
  studentId: string,
  cycleMonth: string,
  actorId: string,
  notes: string
): Promise<void> {
  const id = `${studentId}_${cycleMonth}`;
  const existing = await getDoc<MonthlyPaymentStatus>(COLLECTIONS.MONTHLY_PAYMENT_STATUS, id);

  const newEntry: PaymentAuditEntry = {
    action: 'PAYMENT_CONFIRMED',
    actorId,
    timestamp: nowISO(),
    notes,
  };

  await updateDoc(COLLECTIONS.MONTHLY_PAYMENT_STATUS, id, {
    status: 'paid',
    auditTrail: [...(existing?.auditTrail ?? []), newEntry],
  });
}

/**
 * Waive payment requirement (admin/teacher override).
 */
export async function waivePayment(
  studentId: string,
  cycleMonth: string,
  actorId: string,
  reason: string
): Promise<void> {
  const id = `${studentId}_${cycleMonth}`;
  const existing = await getDoc<MonthlyPaymentStatus>(COLLECTIONS.MONTHLY_PAYMENT_STATUS, id);

  const newEntry: PaymentAuditEntry = {
    action: 'PAYMENT_WAIVED',
    actorId,
    timestamp: nowISO(),
    notes: reason,
  };

  await updateDoc(COLLECTIONS.MONTHLY_PAYMENT_STATUS, id, {
    status: 'waived',
    waivedBy: actorId,
    waivedReason: reason,
    auditTrail: [...(existing?.auditTrail ?? []), newEntry],
  });
}

/**
 * Get all students with compulsory payment in a given cycle (for teacher dashboard).
 */
export async function getCompulsoryPayments(cycleMonth: string): Promise<MonthlyPaymentStatus[]> {
  const constraints: QueryConstraint[] = [
    { type: 'where', field: 'cycleMonth', op: '==', value: cycleMonth },
    { type: 'where', field: 'isCompulsory', op: '==', value: true },
  ];
  return queryDocs<MonthlyPaymentStatus>(COLLECTIONS.MONTHLY_PAYMENT_STATUS, constraints);
}
