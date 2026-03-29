/**
 * API: /api/planning
 *
 * GET  — List lesson plans (teacher sees own, admin sees all). Query: teacherId?, month?
 * POST — Create a new lesson plan for a month
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { createDoc, queryDocs, nowISO } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';
import { writeAuditLog, extractRequestMeta } from '@/services/audit/log';
import { z } from 'zod';

const CreatePlanSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Must be YYYY-MM format'),
  batchBandId: z.string().min(1),
  notes: z.string().optional(),
  status: z.enum(['draft']).default('draft'),
});

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['teacher', 'super_admin']);
    const { searchParams } = new URL(request.url);
    const teacherIdParam = searchParams.get('teacherId');
    const monthParam = searchParams.get('month');

    const constraints: { type: 'where'; field: string; op: '=='; value: string }[] = [];

    if (auth.role === 'super_admin') {
      // Admin can filter by any teacherId, or see all
      if (teacherIdParam) {
        constraints.push({ type: 'where', field: 'teacherId', op: '==', value: teacherIdParam });
      }
    } else {
      // Teachers always see only their own plans
      constraints.push({ type: 'where', field: 'teacherId', op: '==', value: auth.uid });
    }

    if (monthParam) {
      constraints.push({ type: 'where', field: 'month', op: '==', value: monthParam });
    }

    const plans = await queryDocs(COLLECTIONS.LESSON_PLANS, constraints);

    return Response.json({ success: true, plans });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['teacher', 'super_admin']);
    const body = await request.json();
    const parsed = CreatePlanSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const { month, batchBandId, notes, status } = parsed.data;

    const planId = await createDoc(COLLECTIONS.LESSON_PLANS, {
      month,
      batchBandId,
      teacherId: auth.uid,
      notes: notes ?? '',
      status,
      createdAt: nowISO(),
    });

    const { ipAddress, userAgent } = extractRequestMeta(request);
    await writeAuditLog({
      actorId: auth.uid,
      actorRole: auth.role,
      action: 'LESSON_PLAN_CREATED',
      entityType: 'lesson_plan',
      entityId: planId,
      newState: { month, batchBandId, status },
      ipAddress,
      userAgent,
    });

    return Response.json({ success: true, planId }, { status: 201 });
  } catch (error) {
    return authErrorResponse(error);
  }
}
