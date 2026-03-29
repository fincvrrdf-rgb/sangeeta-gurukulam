/**
 * API: /api/admin/settings
 *
 * GET   — Get current app settings (teacher/admin)
 * PATCH — Update settings (super_admin only)
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { getDoc, updateDoc, nowISO } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';
import { writeAuditLog, extractRequestMeta } from '@/services/audit/log';

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request, ['teacher', 'super_admin']);

    const settings = await getDoc(COLLECTIONS.APP_SETTINGS, 'global');

    if (!settings) {
      return Response.json({ error: 'App settings not found' }, { status: 404 });
    }

    return Response.json({ success: true, settings });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['super_admin']);
    const body = await request.json();

    if (!body || typeof body !== 'object' || Object.keys(body).length === 0) {
      return Response.json({ error: 'Request body must be a non-empty object' }, { status: 400 });
    }

    const previousSettings = await getDoc(COLLECTIONS.APP_SETTINGS, 'global');

    await updateDoc(COLLECTIONS.APP_SETTINGS, 'global', {
      ...body,
      updatedBy: auth.uid,
    });

    const { ipAddress, userAgent } = extractRequestMeta(request);
    await writeAuditLog({
      actorId: auth.uid,
      actorRole: auth.role,
      action: 'APP_SETTINGS_UPDATED',
      entityType: 'app_settings',
      entityId: 'global',
      previousState: previousSettings as Record<string, unknown> | null,
      newState: body,
      ipAddress,
      userAgent,
    });

    return Response.json({ success: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}
