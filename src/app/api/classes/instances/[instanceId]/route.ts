/**
 * API: GET/PATCH/DELETE /api/classes/instances/[instanceId]
 *
 * GET  — Fetch a single class instance (used by the teacher attendance page)
 * PATCH — Update a class instance — meet link, status, time rescheduling
 * DELETE — Remove a class instance
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { getDoc, updateDoc, deleteDoc, nowISO } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';
import { writeAuditLog, extractRequestMeta } from '@/services/audit/log';
import { z } from 'zod';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ instanceId: string }> }
) {
  try {
    await requireAuth(request, ['teacher', 'super_admin']);
    const { instanceId } = await params;

    const instance = await getDoc<Record<string, unknown>>(COLLECTIONS.CLASS_INSTANCES, instanceId);
    if (!instance) {
      return Response.json({ error: 'Class instance not found' }, { status: 404 });
    }

    // Extract a human-readable date and time for the attendance page header
    const startISO = (instance.scheduledStartTime as string) ?? '';
    const date = startISO.slice(0, 10);
    const startTime = startISO
      ? new Date(startISO).toLocaleTimeString('en-IN', {
          hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata',
        })
      : '';

    return Response.json({
      id: instanceId,
      date,
      startTime,
      batchBand: (instance.batchBand as string) ?? '',
      status: (instance.status as string) ?? 'scheduled',
      meetLink: (instance.meetLink as string) ?? (instance.googleMeetLink as string) ?? null,
      scheduledStartTime: startISO,
      scheduledEndTime: (instance.scheduledEndTime as string) ?? '',
      studentCount: 0,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

const UpdateInstanceSchema = z.object({
  // Accept with or without https:// — normalize below
  meetLink: z.string().min(1).optional(),
  status: z.enum(['scheduled', 'live', 'completed', 'cancelled']).optional(),
  notes: z.string().optional(),
  // Time reschedule — ISO datetime strings e.g. "2024-01-15T05:30:00+05:30"
  scheduledStartTime: z.string().optional(),
  scheduledEndTime: z.string().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ instanceId: string }> }
) {
  try {
    const auth = await requireAuth(request, ['teacher', 'super_admin']);
    const { instanceId } = await params;
    const body = await request.json();
    const parsed = UpdateInstanceSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const existing = await getDoc(COLLECTIONS.CLASS_INSTANCES, instanceId);
    if (!existing) {
      return Response.json({ error: 'Class instance not found' }, { status: 404 });
    }

    const updates: Record<string, unknown> = { updatedAt: nowISO() };
    if (parsed.data.meetLink !== undefined) {
      // Normalize: ensure https:// prefix
      let link = parsed.data.meetLink.trim();
      if (link && !link.startsWith('http://') && !link.startsWith('https://')) {
        link = 'https://' + link;
      }
      // Store in both fields so all code paths find it
      updates.googleMeetLink = link;
      updates.meetLink = link;
    }
    if (parsed.data.status !== undefined) updates.status = parsed.data.status;
    if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes;
    if (parsed.data.scheduledStartTime !== undefined) updates.scheduledStartTime = parsed.data.scheduledStartTime;
    if (parsed.data.scheduledEndTime !== undefined) updates.scheduledEndTime = parsed.data.scheduledEndTime;

    await updateDoc(COLLECTIONS.CLASS_INSTANCES, instanceId, updates);

    const { ipAddress, userAgent } = extractRequestMeta(request);
    await writeAuditLog({
      actorId: auth.uid,
      actorRole: auth.role,
      action: 'CLASS_INSTANCE_UPDATED',
      entityType: 'class_instance',
      entityId: instanceId,
      newState: updates,
      ipAddress,
      userAgent,
    });

    return Response.json({ success: true, instanceId });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ instanceId: string }> }
) {
  try {
    const auth = await requireAuth(request, ['teacher', 'super_admin']);
    const { instanceId } = await params;

    const existing = await getDoc(COLLECTIONS.CLASS_INSTANCES, instanceId);
    if (!existing) {
      return Response.json({ error: 'Class instance not found' }, { status: 404 });
    }

    await deleteDoc(COLLECTIONS.CLASS_INSTANCES, instanceId);

    const { ipAddress, userAgent } = extractRequestMeta(request);
    await writeAuditLog({
      actorId: auth.uid,
      actorRole: auth.role,
      action: 'CLASS_INSTANCE_DELETED',
      entityType: 'class_instance',
      entityId: instanceId,
      newState: { deleted: true },
      ipAddress,
      userAgent,
    });

    return Response.json({ success: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}
