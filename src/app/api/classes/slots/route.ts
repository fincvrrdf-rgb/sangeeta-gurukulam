/**
 * API: /api/classes/slots
 *
 * GET  — List class slots (teacher sees own, admin sees all)
 * POST — Create a new class slot (teacher/admin only)
 *
 * Accepts either batchBandId (Firestore doc ID) or batchBandCode ('A'|'B'|'C'|'D').
 * If batchBandCode is provided, looks up the matching batch band document.
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { createDoc, queryDocs, nowISO } from '@/lib/firebase/firestore';
import { writeAuditLog, extractRequestMeta } from '@/services/audit/log';
import { COLLECTIONS } from '@/domain/constants';
import type { ClassSlot } from '@/domain/types';
import { z } from 'zod';

const CreateSlotSchema = z.object({
  batchBandId: z.string().optional(),
  batchBandCode: z.string().optional(),
  dayOfWeek: z.number().int().min(0).max(6),
  startTimeIST: z.string().min(1),
  endTimeIST: z.string().min(1),
  slotType: z.enum(['regular', 'makeup', 'testing']),
  isActive: z.boolean().optional().default(true),
});

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['student', 'teacher', 'super_admin']);

    const constraints =
      auth.role === 'teacher'
        ? [{ type: 'where' as const, field: 'teacherId', op: '==' as const, value: auth.uid }]
        : [];

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

    const { dayOfWeek, startTimeIST, endTimeIST, slotType, isActive } = parsed.data;
    let { batchBandId } = parsed.data;

    // If only batchBandCode given, resolve to batchBandId
    if (!batchBandId && parsed.data.batchBandCode) {
      const bands = await queryDocs<Record<string, unknown>>(COLLECTIONS.BATCH_BANDS, [
        { type: 'where', field: 'code', op: '==', value: parsed.data.batchBandCode },
      ]);
      if (bands.length === 0) {
        return Response.json(
          { error: `Batch band with code '${parsed.data.batchBandCode}' not found. Run batch seed first.` },
          { status: 404 }
        );
      }
      batchBandId = bands[0].id as string;
    }

    if (!batchBandId) {
      return Response.json({ error: 'Provide batchBandId or batchBandCode' }, { status: 400 });
    }

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
      createdAt: nowISO(),
      updatedAt: nowISO(),
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
