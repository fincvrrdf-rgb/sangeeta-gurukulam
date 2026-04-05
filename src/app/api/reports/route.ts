/**
 * API: GET /api/reports
 *
 * Lists weekly reports.
 * Teacher/admin: all reports (optionally filtered by studentId or status).
 * Returns reports sorted by weekOf descending.
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { queryDocs } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';
import type { QueryConstraint } from '@/lib/firebase/firestore';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['teacher', 'super_admin']);
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get('studentId');
    const status = searchParams.get('status');

    const filters: QueryConstraint[] = [];
    if (studentId) filters.push({ type: 'where', field: 'studentId', op: '==', value: studentId });
    if (status)    filters.push({ type: 'where', field: 'status',    op: '==', value: status });

    // For teacher role, scope to their students only when no explicit studentId given
    if (auth.role === 'teacher' && !studentId) {
      filters.push({ type: 'where', field: 'teacherId', op: '==', value: auth.uid });
    }

    const reports = await queryDocs<Record<string, unknown>>(COLLECTIONS.WEEKLY_REPORTS, filters);

    // Sort by weekOf descending client-side (avoids composite index requirement)
    reports.sort((a, b) =>
      String(b.weekOf ?? '').localeCompare(String(a.weekOf ?? ''))
    );

    return Response.json({ success: true, reports });
  } catch (error) {
    return authErrorResponse(error);
  }
}
