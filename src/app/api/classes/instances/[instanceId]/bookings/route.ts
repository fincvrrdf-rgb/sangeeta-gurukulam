/**
 * API: GET /api/classes/instances/[instanceId]/bookings
 *
 * Returns the list of students enrolled in the same batch as this class instance.
 * Used by the teacher attendance page to show who is expected.
 *
 * Enrolment is batch-based: students are linked to classes through
 * STUDENT_PROFILES.currentBatchBandId matching ClassInstance.batchBandId.
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { getDoc, queryDocs } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';
import type { ClassInstance } from '@/domain/types';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ instanceId: string }> }
) {
  try {
    await requireAuth(request, ['teacher', 'super_admin']);
    const { instanceId } = await params;

    // 1. Fetch the class instance to find its batch
    const instance = await getDoc<ClassInstance>(COLLECTIONS.CLASS_INSTANCES, instanceId);
    if (!instance) {
      return Response.json({ error: 'Class instance not found' }, { status: 404 });
    }

    const batchBandId = instance.batchBandId;
    if (!batchBandId) {
      return Response.json({ success: true, bookings: [] });
    }

    // 2. Find all active students in this batch
    const profiles = await queryDocs<Record<string, unknown>>(
      COLLECTIONS.STUDENT_PROFILES,
      [{ type: 'where', field: 'currentBatchBandId', op: '==', value: batchBandId }]
    );

    // Filter out deactivated / deleted students
    const activeProfiles = profiles.filter(
      (p) => p.isActive !== false && p.status !== 'inactive'
    );

    if (activeProfiles.length === 0) {
      return Response.json({ success: true, bookings: [] });
    }

    const result = activeProfiles.map((p) => ({
      bookingId:      '',
      studentId:      (p.userId as string) ?? (p.id as string),
      studentName:    (p.displayName as string) ?? (p.fullName as string) ?? (p.name as string) ?? 'Unknown',
      violationCount: (p.consecutiveViolations as number) ?? (p.consecutiveViolationCount as number) ?? 0,
      status:         'enrolled',
      dependentName:  (p.dependentName as string) ?? null,
    }));

    // Sort by name
    result.sort((a, b) => a.studentName.localeCompare(b.studentName));

    return Response.json({ success: true, bookings: result });
  } catch (error) {
    return authErrorResponse(error);
  }
}
