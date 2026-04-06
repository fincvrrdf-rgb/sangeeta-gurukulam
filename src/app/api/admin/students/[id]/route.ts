/**
 * API: /api/admin/students/[id]
 *
 * PATCH  — Update student status (active/inactive) or batch assignment
 * DELETE — Soft-delete student (disables Firebase Auth account, marks isActive=false)
 */

import { NextRequest } from 'next/server';
import { adminAuth } from '@/lib/firebase/admin';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { getDoc, updateDoc, nowISO } from '@/lib/firebase/firestore';
import { writeAuditLog, extractRequestMeta } from '@/services/audit/log';
import { COLLECTIONS } from '@/domain/constants';
import { z } from 'zod';

const UpdateStudentSchema = z.object({
  isActive: z.boolean().optional(),
  currentBatchBandId: z.string().optional(),
  notes: z.string().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request, ['super_admin']);
    const { id } = await params;

    const body = await request.json();
    const parsed = UpdateStudentSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const profile = await getDoc(COLLECTIONS.STUDENT_PROFILES, id);
    if (!profile) {
      return Response.json({ error: 'Student not found' }, { status: 404 });
    }

    const updates: Record<string, unknown> = { updatedAt: nowISO() };
    if (parsed.data.isActive !== undefined) updates.isActive = parsed.data.isActive;
    if (parsed.data.currentBatchBandId !== undefined) updates.currentBatchBandId = parsed.data.currentBatchBandId;
    if (parsed.data.notes !== undefined) updates.placementNotes = parsed.data.notes;

    await updateDoc(COLLECTIONS.STUDENT_PROFILES, id, updates);

    // Sync isActive to the users collection too
    if (parsed.data.isActive !== undefined) {
      await updateDoc(COLLECTIONS.USERS, id, { isActive: parsed.data.isActive, updatedAt: nowISO() });
      // Enable/disable Firebase Auth account
      try {
        await adminAuth.updateUser(id, { disabled: !parsed.data.isActive });
      } catch { /* user may not exist in auth yet */ }
    }

    const { ipAddress, userAgent } = extractRequestMeta(request);
    await writeAuditLog({
      actorId: auth.uid,
      actorRole: auth.role,
      action: 'STUDENT_UPDATED',
      entityType: 'student_profile',
      entityId: id,
      newState: updates,
      ipAddress,
      userAgent,
    });

    return Response.json({ success: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request, ['super_admin']);
    const { id } = await params;

    const profile = await getDoc(COLLECTIONS.STUDENT_PROFILES, id);
    if (!profile) {
      return Response.json({ error: 'Student not found' }, { status: 404 });
    }

    // Soft delete: mark inactive + deletedAt timestamp
    await updateDoc(COLLECTIONS.STUDENT_PROFILES, id, {
      isActive: false,
      deletedAt: nowISO(),
      deletedBy: auth.uid,
      updatedAt: nowISO(),
    });
    await updateDoc(COLLECTIONS.USERS, id, {
      isActive: false,
      deletedAt: nowISO(),
      updatedAt: nowISO(),
    });

    // Disable Firebase Auth account
    try {
      await adminAuth.updateUser(id, { disabled: true });
    } catch { /* skip if not found */ }

    const { ipAddress, userAgent } = extractRequestMeta(request);
    await writeAuditLog({
      actorId: auth.uid,
      actorRole: auth.role,
      action: 'STUDENT_DELETED',
      entityType: 'student_profile',
      entityId: id,
      newState: { isActive: false, deletedAt: nowISO() },
      ipAddress,
      userAgent,
    });

    return Response.json({ success: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}
