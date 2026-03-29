/**
 * API: /api/planning/[month]
 *
 * GET   — Get lesson plan(s) for a specific month (e.g. "2024-03"). Query: teacherId?
 * PATCH — Update plan status, notes, or items
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { queryDocs, updateDoc, nowISO } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';
import { writeAuditLog, extractRequestMeta } from '@/services/audit/log';
import { z } from 'zod';

const UpdatePlanSchema = z.object({
  status: z.enum(['draft', 'published', 'archived']).optional(),
  notes: z.string().optional(),
  items: z.array(z.record(z.unknown())).optional(),
}).refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided' });

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ month: string }> }
) {
  try {
    const auth = await requireAuth(request, ['teacher', 'super_admin']);
    const { month } = await params;
    const { searchParams } = new URL(request.url);
    const teacherIdParam = searchParams.get('teacherId');

    const constraints: { type: 'where'; field: string; op: '=='; value: string }[] = [
      { type: 'where', field: 'month', op: '==', value: month },
    ];

    if (auth.role === 'super_admin') {
      if (teacherIdParam) {
        constraints.push({ type: 'where', field: 'teacherId', op: '==', value: teacherIdParam });
      }
    } else {
      constraints.push({ type: 'where', field: 'teacherId', op: '==', value: auth.uid });
    }

    const plans = await queryDocs(COLLECTIONS.LESSON_PLANS, constraints);

    if (plans.length === 0) {
      return Response.json({ error: 'Lesson plan not found for this month' }, { status: 404 });
    }

    return Response.json({ success: true, plan: plans[0], plans });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ month: string }> }
) {
  try {
    const auth = await requireAuth(request, ['teacher', 'super_admin']);
    const { month } = await params;
    const body = await request.json();
    const parsed = UpdatePlanSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    // Find the plan for this month (teachers can only edit their own)
    const constraints: { type: 'where'; field: string; op: '=='; value: string }[] = [
      { type: 'where', field: 'month', op: '==', value: month },
      ...(auth.role === 'super_admin'
        ? []
        : [{ type: 'where' as const, field: 'teacherId', op: '==' as const, value: auth.uid }]),
    ];

    const plans = await queryDocs<{ id: string }>(COLLECTIONS.LESSON_PLANS, constraints);

    if (plans.length === 0) {
      return Response.json({ error: 'Lesson plan not found for this month' }, { status: 404 });
    }

    const planId = plans[0].id;
    await updateDoc(COLLECTIONS.LESSON_PLANS, planId, {
      ...parsed.data,
      updatedBy: auth.uid,
      updatedAt: nowISO(),
    });

    const { ipAddress, userAgent } = extractRequestMeta(request);
    await writeAuditLog({
      actorId: auth.uid,
      actorRole: auth.role,
      action: 'LESSON_PLAN_UPDATED',
      entityType: 'lesson_plan',
      entityId: planId,
      newState: parsed.data,
      ipAddress,
      userAgent,
    });

    return Response.json({ success: true, planId });
  } catch (error) {
    return authErrorResponse(error);
  }
}
