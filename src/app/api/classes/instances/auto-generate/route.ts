/**
 * API: POST /api/classes/instances/auto-generate
 *
 * Generates class instances for the next N days from active class slots.
 * At most one class per batch per day. Before generating, duplicate slots are
 * deactivated and duplicate classes (no attendance marked) are removed.
 * Skips days where:
 *  - The batch already has a class that date
 *  - The teacher has an availability block for that day
 *
 * Call from teacher panel or via Vercel cron (CRON_SECRET).
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { queryDocs, setDoc, deleteDoc, nowISO } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';
import { parseSchedule, addMinutesHHMM } from '@/lib/classes/student-schedule';
import type { ClassSlot } from '@/domain/types';
import {
  loadBandCodes,
  batchKey,
  splitCanonicalSlots,
  deactivateDuplicateSlots,
  removeDuplicateInstances,
} from '@/lib/classes/dedupe';

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

// Vercel cron jobs call with GET; without this the nightly run got a 405 and
// no classes were generated (the Auto-Schedule button has been removed).
export async function GET(request: NextRequest) {
  return POST(request);
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

    const bandCodes = await loadBandCodes();
    const slotsDeactivated = await deactivateDuplicateSlots(bandCodes);

    // Load active slots, one per batch + weekday
    const activeSlots = await queryDocs<ClassSlot & Record<string, unknown>>(COLLECTIONS.CLASS_SLOTS, [
      { type: 'where', field: 'isActive', op: '==', value: true },
    ]);
    const slots = splitCanonicalSlots(activeSlots, bandCodes).keep;


    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Load existing instances for the date range to avoid duplicates
    const rangeEnd = addDays(today, daysAhead);
    // Full-history sweep (never touches classes with attendance marked)
    const cleanup = await removeDuplicateInstances(bandCodes);

    const existingInstances = await queryDocs<Record<string, unknown>>(COLLECTIONS.CLASS_INSTANCES, [
      { type: 'where', field: 'scheduledStartTime', op: '>=', value: toDateStr(today) },
      { type: 'where', field: 'scheduledStartTime', op: '<=', value: toDateStr(rangeEnd) + 'T23:59:59' },
    ]);

    // "batchCode|date" pairs that already have a class (any slot, any batch ID)
    const existingKeys = new Set<string>();
    for (const inst of existingInstances) {
      const startTime = inst.scheduledStartTime as string ?? '';
      const dateStr = startTime.slice(0, 10);
      existingKeys.add(`${batchKey(bandCodes, inst.batchBandId)}|${dateStr}`);
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

    // Default Meet links per batch code — same link for every class unless overridden
    const DEFAULT_MEET_LINKS: Record<string, string> = {
      'A': 'https://meet.google.com/spv-exsq-sfm',
      'B': 'https://meet.google.com/spv-exsq-sfm',
      'C': 'https://meet.google.com/iyq-wdqw-cfj',
      'D': 'https://meet.google.com/iyq-wdqw-cfj',
    };

    // Per-student schedules: when any student in a batch has one, that batch's
    // classes run on the union of those students' days (not the slot days).
    const profiles = await queryDocs<Record<string, unknown> & { id: string }>(COLLECTIONS.STUDENT_PROFILES, []);
    type DayPlan = { start: string | null; minutes: number };
    const studentPlan = new Map<string, { batchBandId: string; days: Map<number, DayPlan> }>();
    for (const p of profiles) {
      if (p.isActive === false || !p.currentBatchBandId) continue;
      const sched = parseSchedule(p.classSchedule);
      if (!sched) continue;
      const code = batchKey(bandCodes, p.currentBatchBandId);
      const plan = studentPlan.get(code) ?? { batchBandId: String(p.currentBatchBandId), days: new Map() };
      for (const d of sched.days) {
        const prev = plan.days.get(d);
        plan.days.set(d, {
          start: prev?.start ?? sched.startTime,
          minutes: Math.max(prev?.minutes ?? 0, sched.durationMinutes),
        });
      }
      studentPlan.set(code, plan);
    }

    // What to generate: batch code → weekday → { start, end, slot }
    type Planned = { batchBandId: string; start: string; end: string; slotId: string; teacherId: string; timezone: string };
    const plan = new Map<string, Map<number, Planned>>();
    const slotsByBatch = new Map<string, typeof slots>();
    for (const slot of slots) {
      const code = batchKey(bandCodes, slot.batchBandId);
      slotsByBatch.set(code, [...(slotsByBatch.get(code) ?? []), slot]);
    }
    for (const [code, batchSlots] of slotsByBatch) {
      if (studentPlan.has(code)) continue; // student schedules take over below
      const days = new Map<number, Planned>();
      for (const slot of batchSlots) {
        days.set(slot.dayOfWeek, {
          batchBandId: slot.batchBandId,
          start: slot.startTimeLocal || '05:30',
          end: slot.endTimeLocal || '06:30',
          slotId: slot.id,
          teacherId: slot.teacherId || '',
          timezone: slot.timezone || 'Asia/Kolkata',
        });
      }
      plan.set(code, days);
    }
    for (const [code, sp] of studentPlan) {
      const batchSlots = slotsByBatch.get(code) ?? [];
      const days = new Map<number, Planned>();
      for (const [dow, dp] of sp.days) {
        const slot = batchSlots.find((s) => s.dayOfWeek === dow) ?? batchSlots[0];
        const start = dp.start ?? slot?.startTimeLocal ?? '05:30';
        days.set(dow, {
          batchBandId: slot?.batchBandId ?? sp.batchBandId,
          start,
          end: addMinutesHHMM(start, dp.minutes),
          slotId: slot?.id ?? 'student-schedule',
          teacherId: slot?.teacherId || '',
          timezone: 'Asia/Kolkata',
        });
      }
      plan.set(code, days);
    }

    // Drop upcoming auto-created classes on days no scheduled student has any
    // more (only if nothing was recorded on them)
    let unscheduledRemoved = 0;
    const todayStr = toDateStr(today);
    const stale = existingInstances.filter((inst) => {
      const code = batchKey(bandCodes, inst.batchBandId);
      const dateStr = String(inst.scheduledStartTime ?? '').slice(0, 10);
      if (!studentPlan.has(code) || !inst.autoGenerated || dateStr < todayStr) return false;
      if (String(inst.status ?? 'scheduled') !== 'scheduled') return false;
      const dow = new Date(`${dateStr}T00:00:00Z`).getUTCDay();
      return !plan.get(code)?.has(dow);
    });
    if (stale.length > 0) {
      const withRecords = new Set<string>();
      for (let i = 0; i < stale.length; i += 30) {
        const recs = await queryDocs<Record<string, unknown>>(COLLECTIONS.ATTENDANCE_RECORDS, [
          { type: 'where', field: 'classInstanceId', op: 'in', value: stale.slice(i, i + 30).map((x) => x.id as string) },
        ]);
        for (const r of recs) withRecords.add(String(r.classInstanceId));
      }
      for (const inst of stale) {
        if (withRecords.has(inst.id as string)) continue;
        await deleteDoc(COLLECTIONS.CLASS_INSTANCES, inst.id as string);
        existingKeys.delete(`${batchKey(bandCodes, inst.batchBandId)}|${String(inst.scheduledStartTime).slice(0, 10)}`);
        unscheduledRemoved++;
      }
    }

    let created = 0;
    const errors: string[] = [];

    for (let i = 0; i < daysAhead; i++) {
      const date = addDays(today, i);
      const dayOfWeek = date.getDay(); // 0=Sunday
      const dateStr = toDateStr(date);

      for (const [batchCode, days] of plan) {
        const p = days.get(dayOfWeek);
        if (!p) continue;

        const key = `${batchCode}|${dateStr}`;
        if (existingKeys.has(key)) continue;

        // Check teacher unavailability
        if (p.teacherId && blockedDaysByTeacher.get(p.teacherId)?.has(dateStr)) {
          continue;
        }

        try {
          const defaultLink = DEFAULT_MEET_LINKS[batchCode] ?? null;

          // Deterministic ID so concurrent calls (cron + manual) can't duplicate
          const instanceId = `${batchCode}_${dateStr}`;
          await setDoc(COLLECTIONS.CLASS_INSTANCES, instanceId, {
            slotId: p.slotId,
            teacherId: p.teacherId,
            batchBandId: p.batchBandId,
            scheduledStartTime: istTimestamp(dateStr, p.start),
            scheduledEndTime: istTimestamp(dateStr, p.end),
            timezone: p.timezone,
            status: 'scheduled',
            cancellationReason: null,
            rescheduleTargetInstanceId: null,
            googleMeetLink: defaultLink,
            meetLink: defaultLink,
            googleCalendarEventId: null,
            lessonPlanItemId: null,
            teachingUnitId: null,
            notifiedCancellation: false,
            autoGenerated: true,
            generatedBy: actorId,
            createdAt: nowISO(),
          });
          existingKeys.add(key);
          created++;
        } catch (e) {
          errors.push(`${dateStr} batch ${batchCode}: ${e instanceof Error ? e.message : 'error'}`);
        }
      }
    }

    return Response.json({
      success: true,
      created,
      slotsFound: slots.length,
      duplicateSlotsDeactivated: slotsDeactivated,
      duplicateClassesRemoved: cleanup.deleted,
      unscheduledClassesRemoved: unscheduledRemoved,
      daysScanned: daysAhead,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
