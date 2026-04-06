/**
 * API: POST /api/classes/instances/[instanceId]/cancel
 *
 * Cancels a scheduled class instance. Teacher or admin only.
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { getDoc, updateDoc, nowISO } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';
import { writeAuditLog, extractRequestMeta } from '@/services/audit/log';
import { z } from 'zod';

const CancelSchema = z.object({
  reason: z.string().optional().default('Cancelled by teacher'),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ instanceId: string }> }
) {
  try {
    const auth = await requireAuth(request, ['teacher', 'super_admin']);
    const { instanceId } = await params;

    const body = await request.json().catch(() => ({}));
    const parsed = CancelSchema.safeParse(body);
    const reason = parsed.success ? parsed.data.reason : 'Cancelled by teacher';

    const existing = await getDoc(COLLECTIONS.CLASS_INSTANCES, instanceId);
    if (!existing) {
      return Response.json({ error: 'Class instance not found' }, { status: 404 });
    }

    if ((existing as Record<string, unknown>).status === 'cancelled') {
      return Response.json({ error: 'Already cancelled' }, { status: 409 });
    }

    await updateDoc(COLLECTIONS.CLASS_INSTANCES, instanceId, {
      status: 'cancelled',
      cancellationReason: reason,
      cancelledBy: auth.uid,
      cancelledAt: nowISO(),
      updatedAt: nowISO(),
    });

    const { ipAddress, userAgent } = extractRequestMeta(request);
    await writeAuditLog({
      actorId: auth.uid,
      actorRole: auth.role,
      action: 'CLASS_INSTANCE_CANCELLED',
      entityType: 'class_instance',
      entityId: instanceId,
      newState: { status: 'cancelled', cancellationReason: reason },
      ipAddress,
      userAgent,
    });

    return Response.json({ success: true, instanceId });
  } catch (error) {
    return authErrorResponse(error);
  }
}
