/**
 * API: POST /api/students/onboarding
 *
 * Teacher places a student at a starting point in the syllabus.
 * Calls the placement service to create progression records and update the student profile.
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { placeStudent } from '@/services/progression/placement';
import { writeAuditLog, extractRequestMeta } from '@/services/audit/log';
import { z } from 'zod';

const OnboardingSchema = z.object({
  studentId: z.string().min(1),
  teachingUnitId: z.string().min(1),
  batchBandCode: z.string().min(1),
  skipPriorUnits: z.boolean().default(false),
});

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['teacher', 'super_admin']);
    const body = await request.json();
    const parsed = OnboardingSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const { studentId, teachingUnitId, batchBandCode, skipPriorUnits } = parsed.data;

    await placeStudent({
      studentId,
      teacherId: auth.uid,
      lessonId: '',
      teachingUnitId,
      batchBandId: batchBandCode,
      initialMasteryStage: 'introduced',
      placementNotes: `Onboarded by ${auth.role} via API`,
      markEarlierUnitsPassed: skipPriorUnits ? [] : undefined,
    });

    const { ipAddress, userAgent } = extractRequestMeta(request);
    await writeAuditLog({
      actorId: auth.uid,
      actorRole: auth.role,
      action: 'STUDENT_ONBOARDED',
      entityType: 'student_profile',
      entityId: studentId,
      newState: { teachingUnitId, batchBandCode, skipPriorUnits },
      ipAddress,
      userAgent,
    });

    return Response.json({ success: true, studentId });
  } catch (error) {
    return authErrorResponse(error);
  }
}
