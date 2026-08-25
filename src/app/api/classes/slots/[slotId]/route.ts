/**
 * API: /api/classes/slots/[slotId]
 *
 * PATCH  — Update a class slot (teacher who owns it, or super_admin)
 * DELETE — Soft-delete a class slot (set isActive=false)
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { getDoc, updateDoc, nowISO } from '@/lib/firebase/firestore';
import { writeAuditLog, extractRequestMeta } from '@/services/audit/log';
import { COLLECTIONS } from '@/domain/constants';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const PatchSlotSchema = z.object({
  dayOfWeek:    z.number().int().min(0).max(6).optional(),
  startTimeIST: z.string().min(1).optional(),
  endTimeIST:   z.string().min(1).optional(),
  slotType:     z.enum(['regular', 'makeup', 'testing']).optional(),
  isActive:     z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slotId: string }> }
) {
  try {
    const auth = await requireAuth(request, ['teacher', 'super_admin']);
    const { slotId } = await params;

    const slot = await getDoc<Record<string, unknown>>(COLLECTIONS.CLASS_SLOTS, slotId);
    if (!slot) {
      return Response.json({ error: 'Slot not found' }, { status: 404 });
    }

    // Teachers can only edit their own slots
    if (auth.role === 'teacher' && slot.teacherId !== auth.uid) {
      return Response.json({ error: 'Not authorised to edit this slot' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = PatchSlotSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const updates: Record<string, unknown> = { updatedAt: nowISO() };
    if (parsed.data.dayOfWeek    !== undefined) updates.dayOfWeek    = parsed.data.dayOfWeek;
    if (parsed.data.startTimeIST !== undefined) updates.startTimeLocal = parsed.data.startTimeIST;
    if (parsed.data.endTimeIST   !== undefined) updates.endTimeLocal   = parsed.data.endTimeIST;
    if (parsed.data.slotType     !== undefined) updates.slotType     = parsed.data.slotType;
    if (parsed.data.isActive     !== undefined) updates.isActive     = parsed.data.isActive;

    await updateDoc(COLLECTIONS.CLASS_SLOTS, slotId, updates);

    const { ipAddress, userAgent } = extractRequestMeta(request);
    await writeAuditLog({
      actorId: auth.uid, actorRole: auth.role,
      action: 'CLASS_SLOT_UPDATED', entityType: 'class_slot', entityId: slotId,
      newState: updates, ipAddress, userAgent,
    });

    return Response.json({ success: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slotId: string }> }
) {
  try {
    const auth = await requireAuth(request, ['teacher', 'super_admin']);
    const { slotId } = await params;

    const slot = await getDoc<Record<string, unknown>>(COLLECTIONS.CLASS_SLOTS, slotId);
    if (!slot) {
      return Response.json({ error: 'Slot not found' }, { status: 404 });
    }

    if (auth.role === 'teacher' && slot.teacherId !== auth.uid) {
      return Response.json({ error: 'Not authorised to delete this slot' }, { status: 403 });
    }

    await updateDoc(COLLECTIONS.CLASS_SLOTS, slotId, { isActive: false, updatedAt: nowISO() });

    const { ipAddress, userAgent } = extractRequestMeta(request);
    await writeAuditLog({
      actorId: auth.uid, actorRole: auth.role,
      action: 'CLASS_SLOT_DELETED', entityType: 'class_slot', entityId: slotId,
      newState: { isActive: false }, ipAddress, userAgent,
    });

    return Response.json({ success: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}
