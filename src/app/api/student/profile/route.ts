/**
 * API: GET /api/student/profile
 *
 * Returns the current student's profile from STUDENT_PROFILES.
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { queryDocs } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['student', 'super_admin']);

    const profiles = await queryDocs<Record<string, unknown>>(COLLECTIONS.STUDENT_PROFILES, [
      { type: 'where', field: 'userId', op: '==', value: auth.uid },
    ]);

    const profile = profiles[0] ?? null;
    return Response.json(profile);
  } catch (error) {
    return authErrorResponse(error);
  }
}
