/**
 * API: GET /api/recordings/[id]
 *
 * Get a single practice recording by ID.
 * Students can only access their own recordings; teachers and admins can access any.
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { getDoc } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(request);
    const { id } = params;

    const recording = await getDoc(COLLECTIONS.PRACTICE_RECORDINGS, id);

    if (!recording) {
      return Response.json({ error: 'Recording not found' }, { status: 404 });
    }

    // Students can only see their own recordings
    if (auth.role === 'student' && (recording as Record<string, unknown>).studentId !== auth.uid) {
      return Response.json({ error: 'Access denied' }, { status: 403 });
    }

    return Response.json({ recording });
  } catch (error) {
    return authErrorResponse(error);
  }
}
