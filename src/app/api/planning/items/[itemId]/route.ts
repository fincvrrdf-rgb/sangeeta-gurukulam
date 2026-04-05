/**
 * API: DELETE /api/planning/items/[itemId]
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { getDoc, deleteDoc } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';
import { writeAuditLog, extractRequestMeta } from '@/services/audit/log';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  try {
    const auth = await requireAuth(request, ['teacher', 'super_admin']);
    const { itemId } = await params;

    const existing = await getDoc(COLLECTIONS.LESSON_PLAN_ITEMS, itemId);
    if (!existing) {
      return Response.json({ error: 'Plan item not found' }, { status: 404 });
    }

    await deleteDoc(COLLECTIONS.LESSON_PLAN_ITEMS, itemId);

    const { ipAddress, userAgent } = extractRequestMeta(request);
    await writeAuditLog({
      actorId: auth.uid,
      actorRole: auth.role,
      action: 'LESSON_PLAN_ITEM_DELETED',
      entityType: 'lesson_plan_item',
      entityId: itemId,
      previousState: existing as Record<string, unknown>,
      newState: null,
      ipAddress,
      userAgent,
    });

    return Response.json({ success: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}
