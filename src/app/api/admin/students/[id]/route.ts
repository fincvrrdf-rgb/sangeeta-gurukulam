/**
 * API: /api/admin/students/[id]
 *
 * PATCH  — Update student status (active/inactive) or batch assignment
 * DELETE — Soft-delete student (disables Firebase Auth account, marks isActive=false)
 *
 * Teachers and admins (the teacher edits/removes students from the Classes page).
 */

import { NextRequest } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { getDoc, updateDoc, deleteDoc, queryDocs, nowISO } from '@/lib/firebase/firestore';
import { classStudentIds } from '@/lib/classes/dedupe';
import { writeAuditLog, extractRequestMeta } from '@/services/audit/log';
import { COLLECTIONS } from '@/domain/constants';
import { z } from 'zod';

const UpdateStudentSchema = z.object({
  isActive: z.boolean().optional(),
  currentBatchBandId: z.string().optional(),
  notes: z.string().optional(),
  dependentName: z.string().optional(),
  // Profile edit fields
  fullName: z.string().min(1).optional(),
  phone: z.string().optional(),
  guardianName: z.string().optional(),
  billingRegion: z.enum(['india', 'abroad']).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request, ['teacher', 'super_admin']);
    const { id } = await params;

    // Never allow modifying your own account or a super_admin via this route
    if (id === auth.uid) {
      return Response.json({ error: 'You cannot modify your own account here.' }, { status: 403 });
    }
    try {
      const targetUser = await adminAuth.getUser(id);
      if (targetUser.customClaims?.role === 'super_admin') {
        return Response.json({ error: 'Cannot modify a super admin account.' }, { status: 403 });
      }
    } catch { /* user may not exist in Auth yet, continue */ }

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
    if (parsed.data.dependentName !== undefined) updates.dependentName = parsed.data.dependentName || null;
    if (parsed.data.fullName !== undefined) updates.fullName = parsed.data.fullName;
    if (parsed.data.phone !== undefined) updates.phone = parsed.data.phone;
    if (parsed.data.guardianName !== undefined) updates.guardianName = parsed.data.guardianName || null;
    if (parsed.data.billingRegion !== undefined) updates.billingRegion = parsed.data.billingRegion;

    await updateDoc(COLLECTIONS.STUDENT_PROFILES, id, updates);

    // Sync related fields to other collections
    const userUpdates: Record<string, unknown> = { updatedAt: nowISO() };
    if (parsed.data.isActive !== undefined) userUpdates.isActive = parsed.data.isActive;
    if (parsed.data.fullName !== undefined) userUpdates.displayName = parsed.data.fullName;
    await updateDoc(COLLECTIONS.USERS, id, userUpdates);

    if (parsed.data.isActive !== undefined) {
      try {
        await adminAuth.updateUser(id, { disabled: !parsed.data.isActive });
      } catch { /* user may not exist in auth yet */ }
    }
    if (parsed.data.fullName !== undefined) {
      try {
        await adminAuth.updateUser(id, { displayName: parsed.data.fullName });
      } catch { /* skip */ }
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
    const auth = await requireAuth(request, ['teacher', 'super_admin']);
    const { id } = await params;

    // Never allow deleting your own account or another super_admin
    if (id === auth.uid) {
      return Response.json({ error: 'You cannot delete your own account.' }, { status: 403 });
    }
    try {
      const targetUser = await adminAuth.getUser(id);
      const targetRole = targetUser.customClaims?.role;
      if (targetRole === 'super_admin') {
        return Response.json({ error: 'Cannot delete a super admin account.' }, { status: 403 });
      }
    } catch { /* user may not exist in Auth yet, continue */ }

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
    // The user doc may not exist (e.g. student added before sign-up): merge,
    // so a missing doc can't stop the rest of the delete
    await adminDb.collection(COLLECTIONS.USERS).doc(id)
      .set({ isActive: false, deletedAt: nowISO(), updatedAt: nowISO() }, { merge: true });

    // Disable Firebase Auth account
    try {
      await adminAuth.updateUser(id, { disabled: true });
    } catch { /* skip if not found */ }

    // Their upcoming classes: remove their own ones (unless something was
    // recorded on them) and take them off group classes
    const upcoming = await queryDocs<Record<string, unknown> & { id: string }>(COLLECTIONS.CLASS_INSTANCES, [
      { type: 'where', field: 'scheduledStartTime', op: '>=', value: new Date().toISOString().slice(0, 10) },
    ]);
    for (const inst of upcoming) {
      const ids = classStudentIds(inst);
      if (!ids.includes(id)) continue;
      if (ids.length > 1) {
        await updateDoc(COLLECTIONS.CLASS_INSTANCES, inst.id, { studentIds: ids.filter((x) => x !== id) });
        continue;
      }
      const recs = await queryDocs(COLLECTIONS.ATTENDANCE_RECORDS, [
        { type: 'where', field: 'classInstanceId', op: '==', value: inst.id },
      ]);
      if (recs.length === 0) await deleteDoc(COLLECTIONS.CLASS_INSTANCES, inst.id);
    }

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
