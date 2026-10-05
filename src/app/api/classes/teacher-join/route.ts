/**
 * API: POST /api/classes/teacher-join  { batchCode: 'A' }
 *
 * Called when the teacher clicks Join on a batch's Meet link. Records the
 * teacher's join time on today's class for that batch (all duplicate copies),
 * keeping the first click. Returns { recorded: false } if the batch has no
 * class today.
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { queryDocs, updateDoc, nowISO } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';
import { loadBandCodes, batchKey } from '@/lib/classes/dedupe';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const Schema = z.object({ batchCode: z.string().min(1).max(10) });

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['teacher', 'super_admin']);
    const parsed = Schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return Response.json({ error: 'Invalid request' }, { status: 400 });
    }
    const batch = parsed.data.batchCode.toUpperCase();

    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());

    const bandCodes = await loadBandCodes();
    const todays = (await queryDocs<Record<string, unknown> & { id: string }>(COLLECTIONS.CLASS_INSTANCES, [
      { type: 'where', field: 'scheduledStartTime', op: '>=', value: `${today}T00:00:00+05:30` },
      { type: 'where', field: 'scheduledStartTime', op: '<=', value: `${today}T23:59:59+05:30` },
    ])).filter((i) => batchKey(bandCodes, i.batchBandId) === batch && !String(i.status ?? '').includes('cancel'));

    if (todays.length === 0) {
      return Response.json({ success: true, recorded: false, message: `No Batch ${batch} class today.` });
    }

    const existing = todays.map((i) => i.teacherJoinedAt as string | undefined).filter(Boolean).sort()[0];
    const joinedAt = existing ?? nowISO();
    if (!existing) {
      await Promise.all(
        todays.map((i) =>
          updateDoc(COLLECTIONS.CLASS_INSTANCES, i.id, {
            teacherJoinedAt: joinedAt,
            teacherJoinedBy: auth.uid,
            updatedAt: nowISO(),
          }),
        ),
      );
    }

    return Response.json({ success: true, recorded: true, teacherJoinedAt: joinedAt });
  } catch (error) {
    return authErrorResponse(error);
  }
}
