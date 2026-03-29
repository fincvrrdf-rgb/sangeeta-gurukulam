/**
 * API: GET/POST /api/rubrics
 *
 * Assessment rubrics management.
 * - GET: List all rubrics (any authenticated user)
 * - POST: Create a custom rubric (teacher or admin)
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { createDoc, queryDocs, nowISO } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';
import { writeAuditLog, extractRequestMeta } from '@/services/audit/log';
import { z } from 'zod';

const RubricDimensionSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  maxScore: z.number().positive(),
  description: z.string().optional(),
});

const CreateRubricSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  dimensions: z.array(RubricDimensionSchema).min(1),
  isDefault: z.boolean().default(false),
});

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    const rubrics = await queryDocs(COLLECTIONS.ASSESSMENT_RUBRICS, [
      { type: 'orderBy', field: 'createdAt', direction: 'desc' },
    ]);

    return Response.json({ rubrics });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['teacher', 'super_admin']);
    const body = await request.json();
    const parsed = CreateRubricSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const { name, description, dimensions, isDefault } = parsed.data;

    const rubricId = await createDoc(COLLECTIONS.ASSESSMENT_RUBRICS, {
      name,
      description: description ?? null,
      dimensions,
      isDefault,
      createdBy: auth.uid,
    });

    const { ipAddress, userAgent } = extractRequestMeta(request);
    await writeAuditLog({
      actorId: auth.uid,
      actorRole: auth.role,
      action: 'RUBRIC_CREATED',
      entityType: 'assessment_rubric',
      entityId: rubricId,
      newState: { name, dimensionCount: dimensions.length, isDefault },
      ipAddress,
      userAgent,
    });

    return Response.json({ success: true, rubricId });
  } catch (error) {
    return authErrorResponse(error);
  }
}
