/**
 * API: GET /api/class
 *
 * Returns upcoming (or all) class instances relevant to the requesting student.
 * Used by: student absence/mark page to pick which class to mark absence for.
 *
 * Query params:
 *   upcoming=true  — only instances with scheduledStartTime >= now
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { queryDocs } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';
import type { QueryConstraint } from '@/lib/firebase/firestore';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['student', 'teacher', 'super_admin']);
    const { searchParams } = new URL(request.url);
    const upcomingOnly = searchParams.get('upcoming') === 'true';

    const filters: QueryConstraint[] = [
      { type: 'where', field: 'status', op: '==', value: 'scheduled' },
    ];

    if (upcomingOnly) {
      const nowISO = new Date().toISOString();
      filters.push({ type: 'where', field: 'scheduledStartTime', op: '>=', value: nowISO });
    }

    // For students, filter by their batch if possible
    if (auth.role === 'student') {
      const profiles = await queryDocs<Record<string, unknown>>(
        COLLECTIONS.STUDENT_PROFILES,
        [{ type: 'where', field: 'userId', op: '==', value: auth.uid }]
      );
      const batchBandId = profiles[0]?.currentBatchBandId as string | undefined;
      if (batchBandId) {
        filters.push({ type: 'where', field: 'batchBandId', op: '==', value: batchBandId });
      }
    }

    const instances = await queryDocs<Record<string, unknown>>(COLLECTIONS.CLASS_INSTANCES, filters);

    // Sort by scheduledStartTime ascending
    instances.sort((a, b) =>
      String(a.scheduledStartTime ?? '').localeCompare(String(b.scheduledStartTime ?? ''))
    );

    // Limit to next 10 upcoming
    const limited = upcomingOnly ? instances.slice(0, 10) : instances;

    return Response.json({ success: true, classes: limited });
  } catch (error) {
    return authErrorResponse(error);
  }
}
