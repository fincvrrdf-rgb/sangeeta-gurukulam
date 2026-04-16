/**
 * API: GET /api/classes/instances/[instanceId]/attendance
 *
 * Returns existing attendance records for a class instance.
 * Used by the teacher attendance page to pre-fill statuses in edit mode.
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { queryDocs } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ instanceId: string }> }
) {
  try {
    await requireAuth(request, ['teacher', 'super_admin']);
    const { instanceId } = await params;

    const records = await queryDocs<Record<string, unknown>>(
      COLLECTIONS.ATTENDANCE_RECORDS,
      [{ type: 'where', field: 'classInstanceId', op: '==', value: instanceId }]
    );

    // Return a map of studentId → { status, notes, attendanceId }
    const attendanceMap: Record<string, { status: string; notes: string; attendanceId: string }> = {};
    for (const r of records) {
      const sid = r.studentId as string;
      if (sid) {
        // Reverse-map canonical status to UI alias for pre-filling
        const canonical = r.status as string;
        const uiStatus = canonical === 'attended' ? 'present'
          : canonical === 'no_show' ? 'did_not_show'
          : canonical;
        attendanceMap[sid] = {
          status: uiStatus,
          notes: (r.notes as string) ?? '',
          attendanceId: r.id as string,
        };
      }
    }

    return Response.json({ success: true, attendance: attendanceMap });
  } catch (error) {
    return authErrorResponse(error);
  }
}
