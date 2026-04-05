/**
 * API: /api/planning/items
 *
 * GET  — List items for a lesson plan (query: planId)
 * POST — Add an item to a lesson plan
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { createDoc, queryDocs, nowISO } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';
import { writeAuditLog, extractRequestMeta } from '@/services/audit/log';
import { z } from 'zod';

const CreateItemSchema = z.object({
  planId: z.string().min(1),
  weekNumber: z.number().int().min(1),
  teachingUnitId: z.string().optional().default(''),
  teachingUnitName: z.string().optional().default(''),
  objectives: z.string().min(1),
  activities: z.string().min(1),
  resources: z.string().optional(),
  notes: z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['teacher', 'super_admin']);

    const { searchParams } = new URL(request.url);
    const planId = searchParams.get('planId');

    if (!planId) {
      return Response.json({ error: 'planId query parameter is required' }, { status: 400 });
    }

    const items = await queryDocs(COLLECTIONS.LESSON_PLAN_ITEMS, [
      { type: 'where', field: 'planId', op: '==', value: planId },
      { type: 'orderBy', field: 'weekNumber', direction: 'asc' },
    ]);

    return Response.json({ success: true, items });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['teacher', 'super_admin']);
    const body = await request.json();
    const parsed = CreateItemSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const itemId = await createDoc(COLLECTIONS.LESSON_PLAN_ITEMS, {
      ...parsed.data,
      teachingUnit: parsed.data.teachingUnitName || parsed.data.teachingUnitId,
      addedBy: auth.uid,
    });

    const { ipAddress, userAgent } = extractRequestMeta(request);
    await writeAuditLog({
      actorId: auth.uid,
      actorRole: auth.role,
      action: 'LESSON_PLAN_ITEM_ADDED',
      entityType: 'lesson_plan_item',
      entityId: itemId,
      newState: parsed.data,
      ipAddress,
      userAgent,
    });

    return Response.json({ success: true, itemId }, { status: 201 });
  } catch (error) {
    return authErrorResponse(error);
  }
}
