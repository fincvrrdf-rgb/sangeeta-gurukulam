/**
 * services/attendance/counter.ts
 *
 * Manages the consecutive violation counter per student.
 * Uses Firestore transactions to prevent race conditions when
 * two attendance events are processed simultaneously.
 *
 * When the counter reaches the threshold, triggers compulsory payment.
 */

import { runTransaction, docRef, nowISO } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';
import type { PaymentViolationCounter } from '@/domain/types';
import type { AppSettings } from '@/domain/types';
import { triggerCompulsoryPayment } from '@/services/payment/trigger';

interface CounterUpdateInput {
  studentId: string;
  classInstanceId: string;
  isViolation: boolean;
  violationReason: string | null;
  settings: AppSettings;
}

/**
 * Update the consecutive violation counter inside a Firestore transaction.
 *
 * If the student attended properly (isViolation=false), reset the counter
 * (if settings.violationResetOnProperAttendance is true).
 *
 * If the student violated, increment the counter and check the threshold.
 * If threshold is reached, trigger compulsory payment atomically.
 */
export async function updateViolationCounter(input: CounterUpdateInput): Promise<{
  newCount: number;
  compulsoryTriggered: boolean;
}> {
  const { studentId, classInstanceId, isViolation, violationReason, settings } = input;

  return runTransaction(async (txn) => {
    const counterRef = docRef(COLLECTIONS.PAYMENT_VIOLATION_COUNTERS, studentId);
    const counterSnap = await txn.get(counterRef);
    const existing: Partial<PaymentViolationCounter> = counterSnap.exists
      ? (counterSnap.data() as Partial<PaymentViolationCounter>)
      : {};

    const currentCount = existing.currentConsecutiveCount ?? 0;
    const history = existing.violationHistory ?? [];

    // --- Non-violation: reset counter if enabled ---
    if (!isViolation) {
      if (settings.violationResetOnProperAttendance && currentCount > 0) {
        txn.set(counterRef, {
          studentId,
          currentConsecutiveCount: 0,
          violationHistory: history,
          lastViolationAt: existing.lastViolationAt ?? null,
          lastResetAt: nowISO(),
          lastResetReason: 'proper_attendance',
          updatedAt: nowISO(),
        });
      }
      return { newCount: 0, compulsoryTriggered: false };
    }

    // --- Violation: increment counter ---
    const newCount = currentCount + 1;
    const newHistory = [
      ...history,
      {
        classInstanceId,
        date: nowISO(),
        reason: violationReason ?? 'unknown',
        counted: true,
      },
    ];

    txn.set(counterRef, {
      studentId,
      currentConsecutiveCount: newCount,
      violationHistory: newHistory,
      lastViolationAt: nowISO(),
      lastResetAt: existing.lastResetAt ?? null,
      lastResetReason: existing.lastResetReason ?? null,
      updatedAt: nowISO(),
    });

    // --- Check threshold ---
    let compulsoryTriggered = false;
    if (newCount >= settings.consecutiveViolationThreshold) {
      await triggerCompulsoryPayment(studentId, settings, txn);
      compulsoryTriggered = true;
    }

    return { newCount, compulsoryTriggered };
  });
}
