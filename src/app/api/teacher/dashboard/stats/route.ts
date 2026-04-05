/**
 * API: GET /api/teacher/dashboard/stats
 *
 * Returns quick-glance counts for the teacher dashboard:
 *   todayClasses        — class instances scheduled today for this teacher
 *   pendingRecordings   — student recordings awaiting review (status = 'submitted')
 *   unpublishedReports  — weekly reports in draft state
 *   paymentProofsAwaiting — payment proofs awaiting review (status = 'submitted')
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { queryDocs } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['teacher', 'super_admin']);

    const todayIST = new Date(
      new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })
    );
    const dateStr = todayIST.toISOString().slice(0, 10);
    const dayStart = `${dateStr}T00:00:00`;
    const dayEnd   = `${dateStr}T23:59:59`;

    const [todayClassDocs, pendingRecordingDocs, unpublishedReportDocs, pendingProofDocs] =
      await Promise.all([
        // Today's classes for this teacher
        queryDocs<Record<string, unknown>>(COLLECTIONS.CLASS_INSTANCES, [
          { type: 'where', field: 'teacherId',           op: '==', value: auth.uid },
          { type: 'where', field: 'scheduledStartTime',  op: '>=', value: dayStart },
          { type: 'where', field: 'scheduledStartTime',  op: '<=', value: dayEnd },
        ]),
        // Recordings waiting for teacher review
        queryDocs<Record<string, unknown>>(COLLECTIONS.PRACTICE_RECORDINGS, [
          { type: 'where', field: 'reviewStatus', op: '==', value: 'submitted' },
        ]),
        // Draft reports (not yet published to student)
        queryDocs<Record<string, unknown>>(COLLECTIONS.WEEKLY_REPORTS, [
          { type: 'where', field: 'status',    op: '==', value: 'draft' },
          { type: 'where', field: 'teacherId', op: '==', value: auth.uid },
        ]),
        // Payment proofs awaiting review
        queryDocs<Record<string, unknown>>(COLLECTIONS.PAYMENT_PROOF_UPLOADS, [
          { type: 'where', field: 'status', op: '==', value: 'submitted' },
        ]),
      ]);

    return Response.json({
      success: true,
      todayClasses: todayClassDocs.length,
      pendingRecordings: pendingRecordingDocs.length,
      unpublishedReports: unpublishedReportDocs.length,
      paymentProofsAwaiting: pendingProofDocs.length,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
