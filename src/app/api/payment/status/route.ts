/**
 * GET /api/payment/status
 *
 * Returns the current student's payment summary:
 * currentStatus, consecutiveViolations, totalViolations, history.
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { getDoc, queryDocs } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';
import type { StudentProfile, MonthlyPaymentStatus } from '@/domain/types';

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

const VIOLATION_STATUSES = new Set(['compulsory', 'overdue']);

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['student']);

    // Get student profile for violation count
    const profile = await getDoc<StudentProfile>(COLLECTIONS.STUDENT_PROFILES, auth.uid);
    const consecutiveViolations = profile?.consecutiveViolationCount ?? 0;

    // Get all monthly payment statuses
    const history = await queryDocs<MonthlyPaymentStatus>(COLLECTIONS.MONTHLY_PAYMENT_STATUS, [
      { type: 'where', field: 'studentId', op: '==', value: auth.uid },
    ]);

    // Sort history descending by month
    history.sort((a, b) => b.cycleMonth.localeCompare(a.cycleMonth));

    // Current month status
    const thisMonth = currentMonth();
    const current = history.find((h) => h.cycleMonth === thisMonth);
    const currentStatus = current?.status ?? 'not_required';

    // Total violations: months where payment was compulsory and not paid/waived
    const totalViolations = history.filter(
      (h) => h.isCompulsory && VIOLATION_STATUSES.has(h.status)
    ).length;

    const historyOut = history.map((h) => ({
      month: h.cycleMonth,
      status: h.status,
      submittedAt: h.auditTrail?.find((e) => e.action === 'PROOF_SUBMITTED')?.timestamp ?? null,
      reviewedAt: h.auditTrail?.find((e) => e.action === 'PAYMENT_CONFIRMED' || e.action === 'PAYMENT_WAIVED')?.timestamp ?? null,
    }));

    return Response.json({
      currentStatus,
      consecutiveViolations,
      totalViolations,
      history: historyOut,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
