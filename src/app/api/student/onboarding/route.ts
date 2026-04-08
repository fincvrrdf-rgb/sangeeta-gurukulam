/**
 * API: POST /api/student/onboarding
 *
 * Student selects their batch during onboarding.
 * Looks up the batchBandId from the code ('A'/'B'/'C'/'D') and writes it
 * to the student's profile.
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { queryDocs, updateDoc, nowISO } from '@/lib/firebase/firestore';
import { writeAuditLog, extractRequestMeta } from '@/services/audit/log';
import { COLLECTIONS } from '@/domain/constants';
import { z } from 'zod';

const OnboardingSchema = z.object({
  batchCode: z.enum(['A', 'B', 'C', 'D']),
});

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['student', 'super_admin']);
    const body = await request.json();
    const parsed = OnboardingSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json({ error: 'Invalid batch code. Must be A, B, C, or D.' }, { status: 400 });
    }

    const { batchCode } = parsed.data;

    // Look up the BATCH_BANDS document matching this code
    const bands = await queryDocs<Record<string, unknown>>(COLLECTIONS.BATCH_BANDS, [
      { type: 'where', field: 'code', op: '==', value: batchCode },
    ]);

    if (!bands.length) {
      return Response.json({ error: `Batch ${batchCode} not found.` }, { status: 404 });
    }

    const band = bands[0];
    const batchBandId = band.id as string;

    // Merge-update only these fields — do NOT overwrite the rest of the profile
    await updateDoc(COLLECTIONS.STUDENT_PROFILES, auth.uid, {
      currentBatchBandId: batchBandId,
      onboardingComplete: true,
      updatedAt: nowISO(),
    });

    const { ipAddress, userAgent } = extractRequestMeta(request);
    await writeAuditLog({
      actorId: auth.uid,
      actorRole: auth.role,
      action: 'STUDENT_UPDATED',
      entityType: 'student_profile',
      entityId: auth.uid,
      newState: { currentBatchBandId: batchBandId, batchCode },
      ipAddress,
      userAgent,
    });

    return Response.json({ success: true, batchBandId, batchCode });
  } catch (error) {
    return authErrorResponse(error);
  }
}
