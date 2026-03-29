/**
 * API: GET/PATCH /api/assessments/[id]
 *
 * Get or update a single lesson assessment.
 * - GET: Any authenticated user (students see own only)
 * - PATCH: Teacher or admin can update assessment fields
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { getDoc, updateDoc } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';
import { writeAuditLog, extractRequestMeta } from '@/services/audit/log';
import { z } from 'zod';

const UpdateAssessmentSchema = z.object({
  scores: z.record(z.string(), z.number()).optional(),
  totalScore: z.number().optional(),
  maxScore: z.number().positive().optional(),
  result: z.enum(['pass', 'fail', 'needs_improvement']).optional(),
  feedback: z.string().optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: 'At least one field must be provided for update',
});

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(request);
    const { id } = params;

    const assessment = await getDoc(COLLECTIONS.LESSON_ASSESSMENTS, id);
    if (!assessment) {
      return Response.json({ error: 'Assessment not found' }, { status: 404 });
    }

    // Students can only see their own assessments
    if (auth.role === 'student' && (assessment as Record<string, unknown>).studentId !== auth.uid) {
      return Response.json({ error: 'Access denied' }, { status: 403 });
    }

    return Response.json({ assessment });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(request, ['teacher', 'super_admin']);
    const { id } = params;
    const body = await request.json();
    const parsed = UpdateAssessmentSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const assessment = await getDoc(COLLECTIONS.LESSON_ASSESSMENTS, id);
    if (!assessment) {
      return Response.json({ error: 'Assessment not found' }, { status: 404 });
    }

    await updateDoc(COLLECTIONS.LESSON_ASSESSMENTS, id, parsed.data);

    const { ipAddress, userAgent } = extractRequestMeta(request);
    await writeAuditLog({
      actorId: auth.uid,
      actorRole: auth.role,
      action: 'ASSESSMENT_UPDATED',
      entityType: 'lesson_assessment',
      entityId: id,
      previousState: assessment as Record<string, unknown>,
      newState: parsed.data,
      ipAddress,
      userAgent,
    });

    return Response.json({ success: true, assessmentId: id });
  } catch (error) {
    return authErrorResponse(error);
  }
}
