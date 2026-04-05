/**
 * API: GET /api/class
 *
 * Returns upcoming class instances for a student.
 * Query params:
 *   ?upcoming=true — returns next 10 upcoming instances from today
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { queryDocs } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';
import type { QueryConstraint } from '@/lib/firebase/firestore';

interface ClassInstanceDoc {
  id: string;
  slotId: string;
  batchBandId: string;
  scheduledStartTime: string;
  scheduledEndTime: string;
  status: string;
  googleMeetLink?: string | null;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['student', 'teacher', 'super_admin']);

    const { searchParams } = new URL(request.url);
    const upcoming = searchParams.get('upcoming') === 'true';

    const todayISO = new Date().toISOString().slice(0, 10);

    const constraints: QueryConstraint[] = [];

    if (upcoming) {
      constraints.push(
        { type: 'where', field: 'scheduledStartTime', op: '>=', value: todayISO },
      );
    }

    const instances = await queryDocs<ClassInstanceDoc>(COLLECTIONS.CLASS_INSTANCES, constraints);

    // Sort by scheduledStartTime ascending and take next 10
    instances.sort((a, b) => a.scheduledStartTime.localeCompare(b.scheduledStartTime));
    const result = upcoming ? instances.slice(0, 10) : instances;

    // Map to the shape the Mark Absence page expects
    const classes = result.map((inst) => ({
      id: inst.id,
      title: `Batch ${inst.batchBandId ?? 'Class'}`,
      scheduledAt: inst.scheduledStartTime,
      meetLink: inst.googleMeetLink ?? null,
      status: inst.status,
    }));

    return Response.json({ classes });
  } catch (error) {
    return authErrorResponse(error);
  }
}
