/**
 * services/payment/trigger.ts
 *
 * Triggers compulsory payment when a student reaches the consecutive
 * violation threshold. Called from within the violation counter transaction.
 *
 * IMPORTANT: This function runs INSIDE a Firestore transaction to ensure
 * atomicity with the violation counter update.
 */

import { docRef, nowISO } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';
import type { AppSettings, StudentProfile } from '@/domain/types';

/**
 * Trigger compulsory payment for a student within an existing transaction.
 *
 * @param studentId - The student whose payment becomes compulsory
 * @param settings - Current app settings (for amounts)
 * @param txn - The active Firestore transaction
 */
export async function triggerCompulsoryPayment(
  studentId: string,
  settings: AppSettings,
  txn: FirebaseFirestore.Transaction
): Promise<void> {
  // Read student profile to determine billing region
  const studentRef = docRef(COLLECTIONS.STUDENT_PROFILES, studentId);
  const studentSnap = await txn.get(studentRef);

  if (!studentSnap.exists) {
    console.error(`[PAYMENT_TRIGGER] Student profile not found: ${studentId}`);
    return;
  }

  const student = studentSnap.data() as StudentProfile;
  const amount = student.billingRegion === 'india'
    ? settings.compulsoryPaymentAmountIndiaPaise
    : settings.compulsoryPaymentAmountAbroadPaise;

  const cycleMonth = getCurrentCycleMonth();
  const statusId = `${studentId}_${cycleMonth}`;
  const statusRef = docRef(COLLECTIONS.MONTHLY_PAYMENT_STATUS, statusId);
  const triggerReason = `${settings.consecutiveViolationThreshold} consecutive violations reached`;

  // Set payment status to compulsory
  txn.set(statusRef, {
    studentId,
    cycleMonth,
    billingRegion: student.billingRegion,
    isCompulsory: true,
    compulsoryAmountPaise: amount,
    compulsoryTriggeredAt: nowISO(),
    compulsoryTriggerReason: triggerReason,
    status: 'compulsory',
    waivedBy: null,
    waivedReason: null,
    proofUploadId: null,
    auditTrail: [{
      action: 'COMPULSORY_TRIGGERED',
      actorId: 'system',
      timestamp: nowISO(),
      notes: triggerReason,
    }],
    createdAt: nowISO(),
    updatedAt: nowISO(),
  }, { merge: true });

  // Update student profile flags
  txn.update(studentRef, {
    isPaymentCompulsoryThisCycle: true,
    paymentCompulsoryTriggeredAt: nowISO(),
    paymentCompulsoryReason: triggerReason,
    updatedAt: nowISO(),
  });
}

/**
 * Get the current billing cycle month as 'YYYY-MM'.
 */
function getCurrentCycleMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}
