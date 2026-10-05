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
import { queryDocs, setDoc, deleteDoc, updateDoc, nowISO } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';
import { parseSchedule, addMinutesHHMM, startFor, type StudentSchedule } from '@/lib/classes/student-schedule';
import { DEFAULT_BATCH_MEET_LINKS } from '@/domain/constants';
import type { ClassSlot } from '@/domain/types';
import {
  loadBandCodes,
  batchKey,
  splitCanonicalSlots,
  deactivateDuplicateSlots,
  removeDuplicateInstances,
  classKey,
  classStudentIds,
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

    // Classes that already exist, by identity (batch+date / student+date)
    const existingKeys = new Set<string>();
    for (const inst of existingInstances) {
      existingKeys.add(classKey(bandCodes, inst as Record<string, unknown> & { id: string }));
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

    // Students with their own schedule get their own classes (one per student
    // per class day, at their own time). Batch classes are only generated for
    // batches that still have students without a schedule.
    const profiles = await queryDocs<Record<string, unknown> & { id: string }>(COLLECTIONS.STUDENT_PROFILES, []);
    const scheduled: { id: string; batchCode: string; batchBandId: string; sched: StudentSchedule }[] = [];
    const unscheduledBatches = new Set<string>();
    for (const p of profiles) {
      if (p.isActive === false || !p.currentBatchBandId) continue;
      const code = batchKey(bandCodes, p.currentBatchBandId);
      const sched = parseSchedule(p.classSchedule);
      if (sched) scheduled.push({ id: p.id, batchCode: code, batchBandId: String(p.currentBatchBandId), sched });
      else unscheduledBatches.add(code);
    }

    const slotsByBatch = new Map<string, typeof slots>();
    for (const slot of slots) {
      const code = batchKey(bandCodes, slot.batchBandId);
      slotsByBatch.set(code, [...(slotsByBatch.get(code) ?? []), slot]);
    }
    // A batch keeps its slot classes only while someone in it has no schedule
    // of their own (no classes are made for batches with no students)
    const batchClassesWanted = (code: string) => unscheduledBatches.has(code);

    type Planned = {
      key: string;
      id: string;
      batchBandId: string;
      studentIds: string[];
      start: string;
      end: string;
      slotId: string;
      teacherId: string;
    };
    const planFor = (dateStr: string, dow: number): Planned[] => {
      const out: Planned[] = [];
      for (const [code, batchSlots] of slotsByBatch) {
        if (!batchClassesWanted(code)) continue;
        const slot = batchSlots.find((x) => x.dayOfWeek === dow);
        if (!slot) continue;
        out.push({
          key: `${code}|${dateStr}`,
          id: `${code}_${dateStr}`,
          batchBandId: slot.batchBandId,
          studentIds: [],
          start: slot.startTimeLocal || '05:30',
          end: slot.endTimeLocal || '06:30',
          slotId: slot.id,
          teacherId: slot.teacherId || '',
        });
      }
      for (const st of scheduled) {
        if (!st.sched.days.includes(dow)) continue;
        const batchSlots = slotsByBatch.get(st.batchCode) ?? [];
        const slot = batchSlots.find((x) => x.dayOfWeek === dow) ?? batchSlots[0];
        const start = startFor(st.sched, dow) ?? slot?.startTimeLocal ?? '05:30';
        out.push({
          key: `stu:${st.id}|${dateStr}`,
          id: `${st.id}_${dateStr}`,
          batchBandId: st.batchBandId,
          studentIds: [st.id],
          start,
          end: addMinutesHHMM(start, st.sched.durationMinutes),
          slotId: slot?.id ?? 'student-schedule',
          teacherId: slot?.teacherId || '',
        });
      }
      return out;
    };

    // Upcoming auto-created classes that no longer match the plan: remove them
    // (unless something was recorded on them) or re-time them.
    const todayStr = toDateStr(today);
    const stale: Record<string, unknown>[] = [];
    let retimed = 0;
    for (const inst of existingInstances) {
      const dateStr = String(inst.scheduledStartTime ?? '').slice(0, 10);
      if (!inst.autoGenerated || inst.kind === 'extra' || dateStr < todayStr) continue;
      if (String(inst.status ?? 'scheduled') !== 'scheduled') continue;
      const key = classKey(bandCodes, inst as Record<string, unknown> & { id: string });
      const p = planFor(dateStr, new Date(`${dateStr}T00:00:00Z`).getUTCDay()).find((x) => x.key === key);
      if (!p) { stale.push(inst); continue; }
      if (classStudentIds(inst).length === 0) continue; // batch slot classes keep their own times
      const start = istTimestamp(dateStr, p.start);
      const end = istTimestamp(dateStr, p.end);
      if (inst.scheduledStartTime === start && inst.scheduledEndTime === end) continue;
      await updateDoc(COLLECTIONS.CLASS_INSTANCES, inst.id as string, {
        scheduledStartTime: start,
        scheduledEndTime: end,
        updatedAt: nowISO(),
      });
      retimed++;
    }
    let unscheduledRemoved = 0;
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
        existingKeys.delete(classKey(bandCodes, inst as Record<string, unknown> & { id: string }));
        unscheduledRemoved++;
      }
    }

    let created = 0;
    const errors: string[] = [];

    for (let i = 0; i < daysAhead; i++) {
      const date = addDays(today, i);
      const dateStr = toDateStr(date);

      for (const p of planFor(dateStr, date.getDay())) {
        if (existingKeys.has(p.key)) continue;
        if (p.teacherId && blockedDaysByTeacher.get(p.teacherId)?.has(dateStr)) continue;

        try {
          const batchCode = batchKey(bandCodes, p.batchBandId);
          // Batch classes store the batch link; a student's own class resolves
          // its link (the student's own Meet room) when read.
          const link = p.studentIds.length ? null : (DEFAULT_BATCH_MEET_LINKS[batchCode] ?? null);

          // Deterministic ID so concurrent calls (cron + manual) can't duplicate
          await setDoc(COLLECTIONS.CLASS_INSTANCES, p.id, {
            slotId: p.slotId,
            teacherId: p.teacherId,
            batchBandId: p.batchBandId,
            studentIds: p.studentIds,
            kind: 'regular',
            scheduledStartTime: istTimestamp(dateStr, p.start),
            scheduledEndTime: istTimestamp(dateStr, p.end),
            timezone: 'Asia/Kolkata',
            status: 'scheduled',
            cancellationReason: null,
            rescheduleTargetInstanceId: null,
            googleMeetLink: link,
            meetLink: link,
            googleCalendarEventId: null,
            lessonPlanItemId: null,
            teachingUnitId: null,
            notifiedCancellation: false,
            autoGenerated: true,
            generatedBy: actorId,
            createdAt: nowISO(),
          });
          existingKeys.add(p.key);
          created++;
        } catch (e) {
          errors.push(`${dateStr} ${p.key}: ${e instanceof Error ? e.message : 'error'}`);
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
      classesRetimed: retimed,
      daysScanned: daysAhead,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
