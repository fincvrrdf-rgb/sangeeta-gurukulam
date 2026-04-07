/**
 * API: POST /api/admin/devotional-calendar/clear-year
 *
 * Deletes all devotional calendar events for a given year.
 * Super admin only.
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { queryDocs, deleteDoc } from '@/lib/firebase/firestore';
import { writeAuditLog, extractRequestMeta } from '@/services/audit/log';
import { COLLECTIONS } from '@/domain/constants';
import { z } from 'zod';

const ClearSchema = z.object({
  year: z.number().int().min(2020).max(2099),
});

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['super_admin']);
    const body = await request.json();
    const parsed = ClearSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json({ error: 'Invalid request — provide { year: 2026 }' }, { status: 400 });
    }

    const { year } = parsed.data;
    const from = `${year}-01-01`;
    const to = `${year}-12-31`;

    const events = await queryDocs<{ id: string }>(COLLECTIONS.DEVOTIONAL_CALENDAR_EVENTS, [
      { type: 'where', field: 'date', op: '>=', value: from },
      { type: 'where', field: 'date', op: '<=', value: to },
    ]);

    let deleted = 0;
    for (const ev of events) {
      await deleteDoc(COLLECTIONS.DEVOTIONAL_CALENDAR_EVENTS, ev.id);
      deleted++;
    }

    const { ipAddress, userAgent } = extractRequestMeta(request);
    await writeAuditLog({
      actorId: auth.uid,
      actorRole: auth.role,
      action: 'DEVOTIONAL_CALENDAR_CLEARED',
      entityType: 'devotional_calendar_event',
      entityId: String(year),
      newState: { year, deleted },
      ipAddress,
      userAgent,
    });

    return Response.json({ success: true, deleted });
  } catch (error) {
    return authErrorResponse(error);
  }
}
