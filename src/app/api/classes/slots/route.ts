/**
 * API: /api/classes/slots
 *
 * GET  — List class slots (teacher sees own, admin sees all)
 * POST — Create a new class slot (teacher/admin only)
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse, AuthError } from '@/lib/auth/middleware';
import { createDoc, queryDocs, nowISO } from '@/lib/firebase/firestore';
import { writeAuditLog, extractRequestMeta } from '@/services/audit/log';
import { COLLECTIONS } from '@/domain/constants';
import type { ClassSlot } from '@/domain/types';
import { z } from 'zod';

const CreateSlotSchema = z.object({
  batchBandId: z.string().min(1),
  dayOfWeek: z.number().int().min(0).max(6),
  startTimeIST: z.string().min(1),
  endTimeIST: z.string().min(1),
  slotType: z.enum(['regular', 'makeup', 'testing']),
  isActive: z.boolean(),
});

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['teacher', 'super_admin']);

    const constraints =
      auth.role === 'super_admin'
        ? []
        : [{ type: 'where' as const, field: 'teacherId', op: '==' as const, value: auth.uid }];

    const slots = await queryDocs<ClassSlot>(COLLECTIONS.CLASS_SLOTS, constraints);

    return Response.json({ success: true, slots });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['teacher', 'super_admin']);
    const body = await request.json();
    const parsed = CreateSlotSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const { batchBandId, dayOfWeek, startTimeIST, endTimeIST, slotType, isActive } = parsed.data;

    const slotId = await createDoc(COLLECTIONS.CLASS_SLOTS, {
      teacherId: auth.uid,
      batchBandId,
      dayOfWeek,
      startTimeLocal: startTimeIST,
      endTimeLocal: endTimeIST,
      timezone: 'Asia/Kolkata',
      slotType,
      recurrenceRule: '',
      maxCapacity: 10,
      isActive,
      createdBy: auth.uid,
    });

    const { ipAddress, userAgent } = extractRequestMeta(request);
    await writeAuditLog({
      actorId: auth.uid,
      actorRole: auth.role,
      action: 'CLASS_SLOT_CREATED',
      entityType: 'class_slot',
      entityId: slotId,
      newState: { batchBandId, dayOfWeek, startTimeIST, endTimeIST, slotType, isActive },
      ipAddress,
      userAgent,
    });

    return Response.json({ success: true, slotId });
  } catch (error) {
    return authErrorResponse(error);
  }
}
