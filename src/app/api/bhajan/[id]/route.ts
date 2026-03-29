/**
 * API: PATCH /api/bhajan/[id]
 *
 * Update a bhajan session (add YouTube link, change status, etc.).
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { getDoc, updateDoc, nowISO } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';
import { writeAuditLog, extractRequestMeta } from '@/services/audit/log';
import type { BhajanSession } from '@/domain/types';
import { z } from 'zod';

const UpdateBhajanSchema = z.object({
  youtubeLink: z.string().url().optional(),
  status: z.enum(['scheduled', 'live', 'ended']).optional(),
  attendeeCount: z.number().min(0).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request, ['teacher', 'super_admin']);
    const { id } = await params;
    const body = await request.json();
    const parsed = UpdateBhajanSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const existing = await getDoc<BhajanSession>(COLLECTIONS.BHAJAN_SESSIONS, id);
    if (!existing) {
      return Response.json({ error: 'Bhajan session not found' }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};
    if (parsed.data.youtubeLink !== undefined) updates.youtubeUrl = parsed.data.youtubeLink;
    if (parsed.data.status !== undefined) updates.status = parsed.data.status;
    if (parsed.data.attendeeCount !== undefined) updates.attendeeCount = parsed.data.attendeeCount;

    await updateDoc(COLLECTIONS.BHAJAN_SESSIONS, id, updates);

    const { ipAddress, userAgent } = extractRequestMeta(request);
    await writeAuditLog({
      actorId: auth.uid,
      actorRole: auth.role,
      action: 'BHAJAN_SESSION_UPDATED',
      entityType: 'bhajan_session',
      entityId: id,
      previousState: { status: existing.status, youtubeUrl: existing.youtubeUrl },
      newState: updates,
      ipAddress,
      userAgent,
    });

    return Response.json({ success: true, id });
  } catch (error) {
    return authErrorResponse(error);
  }
}
