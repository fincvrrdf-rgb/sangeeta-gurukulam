/**
 * API: PUT /api/students/[id]/schedule
 *
 * Set (or clear, with days: []) a student's own class schedule — which
 * weekdays they have class, how long, and optionally what time (with
 * per-weekday overrides).
 * Teacher / admin only.
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { getDoc, updateDoc, nowISO } from '@/lib/firebase/firestore';
import { writeAuditLog, extractRequestMeta } from '@/services/audit/log';
import { COLLECTIONS } from '@/domain/constants';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const ScheduleSchema = z.object({
  days: z.array(z.number().int().min(0).max(6)).max(7),
  durationMinutes: z.number().int().min(5).max(300),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  // Per-weekday start overrides, e.g. { '3': '06:00' } for Wednesdays
  dayTimes: z.record(z.string().regex(/^[0-6]$/), z.string().regex(/^\d{2}:\d{2}$/)).optional(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const auth = await requireAuth(request, ['teacher', 'super_admin']);
    const parsed = ScheduleSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return Response.json({ error: 'Invalid schedule', details: parsed.error.flatten() }, { status: 400 });
    }

    const profile = await getDoc(COLLECTIONS.STUDENT_PROFILES, params.id);
    if (!profile) {
      return Response.json({ error: 'Student not found' }, { status: 404 });
    }

    const days = [...new Set(parsed.data.days)].sort();
    const classSchedule = days.length
      ? {
          days,
          durationMinutes: parsed.data.durationMinutes,
          startTime: parsed.data.startTime ?? null,
          dayTimes: Object.fromEntries(
            Object.entries(parsed.data.dayTimes ?? {}).filter(
              ([d, t]) => days.includes(Number(d)) && t !== (parsed.data.startTime ?? null),
            ),
          ),
        }
      : null;

    await updateDoc(COLLECTIONS.STUDENT_PROFILES, params.id, { classSchedule, updatedAt: nowISO() });

    const { ipAddress, userAgent } = extractRequestMeta(request);
    await writeAuditLog({
      actorId: auth.uid,
      actorRole: auth.role,
      action: 'STUDENT_SCHEDULE_UPDATED',
      entityType: 'student_profile',
      entityId: params.id,
      newState: { classSchedule },
      ipAddress,
      userAgent,
    });

    return Response.json({ success: true, classSchedule });
  } catch (error) {
    return authErrorResponse(error);
  }
}
