/**
 * API: POST /api/classes/[instanceId]/cancel
 *
 * Cancels a class instance (sets status to 'teacher_cancelled').
 * Records the cancellation reason and writes an audit log.
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse, AuthError } from '@/lib/auth/middleware';
import { getDoc, updateDoc } from '@/lib/firebase/firestore';
import { writeAuditLog, extractRequestMeta } from '@/services/audit/log';
import { COLLECTIONS } from '@/domain/constants';
import type { ClassInstance } from '@/domain/types';
import { z } from 'zod';

const CancelInstanceSchema = z.object({
  reason: z.string().min(1, 'Cancellation reason is required'),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ instanceId: string }> }
) {
  try {
    const auth = await requireAuth(request, ['teacher', 'super_admin']);
    const { instanceId } = await params;
    const body = await request.json();
    const parsed = CancelInstanceSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const { reason } = parsed.data;

    // Load class instance
    const instance = await getDoc<ClassInstance>(COLLECTIONS.CLASS_INSTANCES, instanceId);
    if (!instance) {
      return Response.json({ error: 'Class instance not found' }, { status: 404 });
    }

    // Prevent cancelling an already-cancelled instance
    if (instance.status === 'cancelled') {
      return Response.json({ error: 'Class instance is already cancelled' }, { status: 400 });
    }

    const previousStatus = instance.status;

    await updateDoc(COLLECTIONS.CLASS_INSTANCES, instanceId, {
      status: 'teacher_cancelled',
      cancellationReason: reason,
    });

    const { ipAddress, userAgent } = extractRequestMeta(request);
    await writeAuditLog({
      actorId: auth.uid,
      actorRole: auth.role,
      action: 'CLASS_INSTANCE_CANCELLED',
      entityType: 'class_instance',
      entityId: instanceId,
      previousState: { status: previousStatus },
      newState: { status: 'teacher_cancelled', cancellationReason: reason },
      ipAddress,
      userAgent,
    });

    return Response.json({ success: true, instanceId, status: 'teacher_cancelled' });
  } catch (error) {
    return authErrorResponse(error);
  }
}
