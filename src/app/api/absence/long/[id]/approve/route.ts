/**
 * API: POST /api/absence/long/[id]/approve
 *
 * Teacher or admin approves or rejects a long absence request.
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { getDoc, updateDoc, nowISO } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';
import { writeAuditLog, extractRequestMeta } from '@/services/audit/log';
import type { LongAbsenceRecord } from '@/domain/types';
import { z } from 'zod';

const ApproveSchema = z.object({
  action: z.enum(['approve', 'reject']),
  notes: z.string().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request, ['teacher', 'super_admin']);
    const { id } = await params;
    const body = await request.json();
    const parsed = ApproveSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const { action, notes } = parsed.data;

    // Load existing record
    const record = await getDoc<LongAbsenceRecord>(COLLECTIONS.LONG_ABSENCE_RECORDS, id);

    if (!record) {
      return Response.json({ error: 'Long absence record not found' }, { status: 404 });
    }

    if (record.status !== 'pending') {
      return Response.json({ error: `Record has already been ${record.status}` }, { status: 400 });
    }

    const newStatus = action === 'approve' ? 'approved' : 'rejected';

    // Update record
    await updateDoc(COLLECTIONS.LONG_ABSENCE_RECORDS, id, {
      status: newStatus,
      approvedBy: auth.uid,
      approvedAt: nowISO(),
      notes: notes ?? record.notes,
    });

    // Audit log
    const { ipAddress, userAgent } = extractRequestMeta(request);
    await writeAuditLog({
      actorId: auth.uid,
      actorRole: auth.role,
      action: action === 'approve' ? 'LONG_ABSENCE_APPROVED' : 'LONG_ABSENCE_REJECTED',
      entityType: 'long_absence_record',
      entityId: id,
      previousState: { status: record.status },
      newState: { status: newStatus, notes },
      ipAddress,
      userAgent,
    });

    return Response.json({ success: true, status: newStatus });
  } catch (error) {
    return authErrorResponse(error);
  }
}
