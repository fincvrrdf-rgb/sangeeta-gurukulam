/**
 * API: GET /api/students
 *
 * Returns a list of students (name, id, batchBand) for teacher use in dropdowns.
 * Teachers can see students in their assigned batches; super_admin sees all.
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { queryDocs } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['teacher', 'super_admin']);

    const profiles = await queryDocs<Record<string, unknown>>(COLLECTIONS.STUDENT_PROFILES, []);

    const students = profiles.map((p) => ({
      id: p.userId as string,
      name: p.fullName as string || (p.userId as string),
      batchBand: p.currentBatchBandCode as string || '',
    }));

    // Teachers only see students in their batches (if assigned)
    if (auth.role === 'teacher') {
      const teacherProfile = await queryDocs<Record<string, unknown>>(COLLECTIONS.TEACHER_PROFILES, [
        { type: 'where', field: 'userId', op: '==', value: auth.uid },
      ]);
      const assignedBands: string[] = (teacherProfile[0]?.assignedBatchBandIds as string[]) ?? [];
      if (assignedBands.length > 0) {
        const filtered = students.filter((s) => assignedBands.includes(s.batchBand));
        return Response.json({ success: true, students: filtered });
      }
    }

    return Response.json({ success: true, students });
  } catch (error) {
    return authErrorResponse(error);
  }
}
