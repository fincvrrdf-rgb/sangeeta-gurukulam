/**
 * API: /api/admin/devotional-calendar
 *
 * GET  — List devotional calendar events (optional month filter, all authenticated users)
 * POST — Create a new event (super_admin only)
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { createDoc, queryDocs, nowISO } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';
import { writeAuditLog, extractRequestMeta } from '@/services/audit/log';
import { z } from 'zod';

const CreateEventSchema = z.object({
  name: z.string().min(1),
  date: z.string().min(1),
  eventType: z.string().min(1),
  description: z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request, []);

    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');

    const constraints = month
      ? [
          { type: 'where' as const, field: 'date', op: '>=' as const, value: `${month}-01` },
          { type: 'where' as const, field: 'date', op: '<=' as const, value: `${month}-31` },
        ]
      : [];

    const events = await queryDocs(COLLECTIONS.DEVOTIONAL_CALENDAR_EVENTS, constraints);

    return Response.json({ success: true, events });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['super_admin']);
    const body = await request.json();
    const parsed = CreateEventSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const eventId = await createDoc(COLLECTIONS.DEVOTIONAL_CALENDAR_EVENTS, {
      ...parsed.data,
      createdBy: auth.uid,
    });

    const { ipAddress, userAgent } = extractRequestMeta(request);
    await writeAuditLog({
      actorId: auth.uid,
      actorRole: auth.role,
      action: 'DEVOTIONAL_EVENT_CREATED',
      entityType: 'devotional_calendar_event',
      entityId: eventId,
      newState: parsed.data,
      ipAddress,
      userAgent,
    });

    return Response.json({ success: true, eventId }, { status: 201 });
  } catch (error) {
    return authErrorResponse(error);
  }
}
