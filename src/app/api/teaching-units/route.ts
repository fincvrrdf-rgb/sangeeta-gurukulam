/**
 * API: GET /api/teaching-units
 *
 * Returns all active teaching units with their lesson names.
 * Used for dropdowns in assessments, lesson plans, etc.
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { queryDocs } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request, ['teacher', 'super_admin']);

    const [units, lessons] = await Promise.all([
      queryDocs<Record<string, unknown>>(COLLECTIONS.TEACHING_UNITS, [
        { type: 'where', field: 'isActive', op: '==', value: true },
      ]),
      queryDocs<Record<string, unknown>>(COLLECTIONS.SYLLABUS_LESSONS, []),
    ]);

    const lessonMap = new Map(lessons.map((l) => [l.id as string, l.lessonName as string]));

    const result = units.map((u) => ({
      id: u.id as string,
      name: u.unitName as string,
      lessonName: lessonMap.get(u.lessonId as string) ?? 'Unknown Lesson',
      unitNumber: u.unitNumber as number,
      ragam: u.ragam as string || '',
      taalam: u.taalam as string || '',
    })).sort((a, b) => a.unitNumber - b.unitNumber);

    return Response.json({ success: true, units: result });
  } catch (error) {
    return authErrorResponse(error);
  }
}
