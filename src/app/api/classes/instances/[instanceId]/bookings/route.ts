/**
 * API: GET /api/classes/instances/[instanceId]/bookings
 *
 * Returns the list of students booked into a specific class instance.
 * Used by the teacher attendance page to show who is expected.
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { queryDocs } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';

export async function GET(
  request: NextRequest,
  { params }: { params: { instanceId: string } }
) {
  try {
    await requireAuth(request, ['teacher', 'super_admin']);
    const { instanceId } = params;

    // Get all bookings for this instance
    const bookings = await queryDocs<Record<string, unknown>>(
      COLLECTIONS.STUDENT_CLASS_BOOKINGS,
      [{ type: 'where', field: 'classInstanceId', op: '==', value: instanceId }]
    );

    if (bookings.length === 0) {
      return Response.json({ success: true, bookings: [] });
    }

    // Fetch student profiles to get names
    const studentIds = [...new Set(bookings.map((b) => b.studentId as string))];

    const profiles = await queryDocs<Record<string, unknown>>(
      COLLECTIONS.STUDENT_PROFILES,
      [{ type: 'where', field: 'userId', op: 'in', value: studentIds.slice(0, 30) }]
    );

    const profileMap = new Map(profiles.map((p) => [p.userId as string, p]));

    const result = bookings.map((b) => {
      const profile = profileMap.get(b.studentId as string);
      return {
        bookingId:      b.id as string,
        studentId:      b.studentId as string,
        studentName:    (profile?.displayName as string) ?? (profile?.fullName as string) ?? (profile?.name as string) ?? 'Unknown',
        violationCount: (profile?.consecutiveViolations as number) ?? (profile?.consecutiveViolationCount as number) ?? 0,
        status:         b.status ?? 'booked',
        // Dependent support: if a student has a child joining with them, surface the child's name
        dependentName:  (profile?.dependentName as string) ?? null,
      };
    });

    // Sort by name
    result.sort((a, b) => a.studentName.localeCompare(b.studentName));

    return Response.json({ success: true, bookings: result });
  } catch (error) {
    return authErrorResponse(error);
  }
}
