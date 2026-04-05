/**
 * API: POST /api/classes/instances/auto-generate
 *
 * Generates class instances for the next N days from active class slots.
 * Skips days where:
 *  - An instance already exists for that slot+date
 *  - The teacher has an availability block for that day
 *
 * Call from teacher panel or via Vercel cron (CRON_SECRET).
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { queryDocs, createDoc, nowISO } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';
import type { ClassSlot } from '@/domain/types';

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Build an IST ISO timestamp string from a YYYY-MM-DD date and HH:MM local time */
function istTimestamp(dateStr: string, timeHHMM: string): string {
  return `${dateStr}T${timeHHMM}:00+05:30`;
}

export async function POST(request: NextRequest) {
  try {
    // Allow cron or teacher/admin
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`;

    let actorId = 'system';
    let actorRole: 'teacher' | 'super_admin' | 'system' = 'system';

    if (!isCron) {
      const auth = await requireAuth(request, ['teacher', 'super_admin']);
      actorId = auth.uid;
      actorRole = auth.role as 'teacher' | 'super_admin';
    }

    const body = await request.json().catch(() => ({}));
    const daysAhead = Math.min(Number(body.daysAhead) || 14, 30);

    // Load all active slots
    const slots = await queryDocs<ClassSlot>(COLLECTIONS.CLASS_SLOTS, [
      { type: 'where', field: 'isActive', op: '==', value: true },
    ]);

    if (slots.length === 0) {
      return Response.json({ success: true, created: 0, message: 'No active class slots found. Create slots first.' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Load existing instances for the date range to avoid duplicates
    const rangeEnd = addDays(today, daysAhead);
    const existingInstances = await queryDocs<Record<string, unknown>>(COLLECTIONS.CLASS_INSTANCES, [
      { type: 'where', field: 'scheduledStartTime', op: '>=', value: toDateStr(today) },
      { type: 'where', field: 'scheduledStartTime', op: '<=', value: toDateStr(rangeEnd) + 'T23:59:59' },
    ]);

    // Build a set of "slotId|date" already existing
    const existingKeys = new Set<string>();
    for (const inst of existingInstances) {
      const startTime = inst.scheduledStartTime as string ?? '';
      const dateStr = startTime.slice(0, 10);
      existingKeys.add(`${inst.slotId}|${dateStr}`);
    }

    // Load teacher unavailability blocks
    const unavailability = await queryDocs<Record<string, unknown>>(COLLECTIONS.TEACHER_AVAILABILITY_BLOCKS, [
      { type: 'where', field: 'startDate', op: '>=', value: toDateStr(today) },
    ]);
    const blockedDaysByTeacher = new Map<string, Set<string>>();
    for (const block of unavailability) {
      const teacherId = block.teacherId as string;
      const startDate = block.startDate as string;
      const endDate = block.endDate as string ?? startDate;
      if (!blockedDaysByTeacher.has(teacherId)) {
        blockedDaysByTeacher.set(teacherId, new Set());
      }
      // Mark each day in the block range
      const blockStart = new Date(startDate + 'T00:00:00');
      const blockEnd = new Date(endDate + 'T00:00:00');
      for (let d = new Date(blockStart); d <= blockEnd; d = addDays(d, 1)) {
        blockedDaysByTeacher.get(teacherId)!.add(toDateStr(d));
      }
    }

    let created = 0;
    const errors: string[] = [];

    for (let i = 0; i < daysAhead; i++) {
      const date = addDays(today, i);
      const dayOfWeek = date.getDay(); // 0=Sunday
      const dateStr = toDateStr(date);

      for (const slot of slots) {
        if (slot.dayOfWeek !== dayOfWeek) continue;

        const key = `${slot.id}|${dateStr}`;
        if (existingKeys.has(key)) continue;

        // Check teacher unavailability
        if (slot.teacherId && blockedDaysByTeacher.get(slot.teacherId)?.has(dateStr)) {
          continue;
        }

        try {
          const startTime = istTimestamp(dateStr, slot.startTimeLocal || '05:30');
          const endTime = istTimestamp(dateStr, slot.endTimeLocal || '06:30');

          await createDoc(COLLECTIONS.CLASS_INSTANCES, {
            slotId: slot.id,
            teacherId: slot.teacherId || '',
            batchBandId: slot.batchBandId,
            scheduledStartTime: startTime,
            scheduledEndTime: endTime,
            timezone: slot.timezone || 'Asia/Kolkata',
            status: 'scheduled',
            cancellationReason: null,
            rescheduleTargetInstanceId: null,
            googleMeetLink: null,
            googleCalendarEventId: null,
            lessonPlanItemId: null,
            teachingUnitId: null,
            notifiedCancellation: false,
            autoGenerated: true,
            generatedBy: actorId,
            createdAt: nowISO(),
            updatedAt: nowISO(),
          });
          existingKeys.add(key);
          created++;
        } catch (e) {
          errors.push(`${dateStr} slot ${slot.id}: ${e instanceof Error ? e.message : 'error'}`);
        }
      }
    }

    return Response.json({
      success: true,
      created,
      slotsFound: slots.length,
      daysScanned: daysAhead,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
