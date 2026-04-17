/**
 * API: GET /api/classes/instances/[instanceId]/bookings
 *
 * Returns the list of learners expected for a class instance:
 *   1. Students whose profile is currently assigned to the instance's batch, PLUS
 *   2. Any student who already has an attendance record for this instance
 *      (covers students who were moved to a different batch after attendance
 *      was marked — they must still appear so past attendance can be edited).
 *
 * Enrolment is batch-based: students are linked to classes through
 * STUDENT_PROFILES.currentBatchBandId matching ClassInstance.batchBandId.
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { getDoc, queryDocs } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';
import type { ClassInstance } from '@/domain/types';

export const dynamic = 'force-dynamic';

function resolveName(
  profile: Record<string, unknown> | null,
  user: Record<string, unknown> | null,
): string {
  const candidates = [
    profile?.displayName,
    profile?.fullName,
    profile?.name,
    user?.displayName,
    user?.fullName,
    user?.email,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c;
  }
  return 'Unknown';
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ instanceId: string }> }
) {
  try {
    await requireAuth(request, ['teacher', 'super_admin']);
    const { instanceId } = await params;

    const instance = await getDoc<ClassInstance>(COLLECTIONS.CLASS_INSTANCES, instanceId);
    if (!instance) {
      return Response.json({ error: 'Class instance not found' }, { status: 404 });
    }

    const batchBandId = instance.batchBandId;

    // 1. Current batch members
    const batchProfiles = batchBandId
      ? await queryDocs<Record<string, unknown>>(
          COLLECTIONS.STUDENT_PROFILES,
          [{ type: 'where', field: 'currentBatchBandId', op: '==', value: batchBandId }]
        )
      : [];

    const activeBatchProfiles = batchProfiles.filter(
      (p) => p.isActive !== false && p.status !== 'inactive'
    );

    // 2. Students who already have attendance for this instance (may include ones
    //    who have since moved batches — we still need to show them in edit mode).
    const existingAttendance = await queryDocs<Record<string, unknown>>(
      COLLECTIONS.ATTENDANCE_RECORDS,
      [{ type: 'where', field: 'classInstanceId', op: '==', value: instanceId }]
    );

    // Strip the "_dependent" suffix to find the real primary student ids
    const primaryIdsFromAttendance = new Set<string>();
    for (const rec of existingAttendance) {
      const sid = (rec.studentId as string) || '';
      if (!sid) continue;
      primaryIdsFromAttendance.add(sid.replace(/_dependent$/, ''));
    }

    const batchProfileIds = new Set(activeBatchProfiles.map((p) => p.userId as string));
    const extraIds = [...primaryIdsFromAttendance].filter((id) => !batchProfileIds.has(id));

    // Fetch profiles + users for the extras
    const extraProfiles: Record<string, unknown>[] = [];
    for (const id of extraIds) {
      const prof = await getDoc<Record<string, unknown>>(COLLECTIONS.STUDENT_PROFILES, id);
      if (prof) extraProfiles.push(prof);
    }

    const combinedProfiles = [...activeBatchProfiles, ...extraProfiles];

    // Fetch user docs for name fallback when profile has no fullName
    const userCache: Record<string, Record<string, unknown> | null> = {};
    for (const p of combinedProfiles) {
      const uid = (p.userId as string) || '';
      if (!uid || uid in userCache) continue;
      try {
        userCache[uid] = await getDoc<Record<string, unknown>>(COLLECTIONS.USERS, uid);
      } catch {
        userCache[uid] = null;
      }
    }

    const result = combinedProfiles.map((p) => {
      const uid = (p.userId as string) || (p.id as string);
      const user = userCache[uid] ?? null;
      return {
        bookingId:      '',
        studentId:      uid,
        studentName:    resolveName(p, user),
        violationCount: (p.consecutiveViolations as number) ?? (p.consecutiveViolationCount as number) ?? 0,
        status:         'enrolled',
        dependentName:  (p.dependentName as string) ?? null,
      };
    });

    result.sort((a, b) => a.studentName.localeCompare(b.studentName));

    return Response.json({ success: true, bookings: result });
  } catch (error) {
    return authErrorResponse(error);
  }
}
