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
import { queryDocs, setDoc, nowISO } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';
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

    if (slots.length === 0) {
      return Response.json({ success: true, created: 0, message: 'No active class slots found. Create slots first.' });
    }

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

    const bandCodeMap = bandCodes;

    let created = 0;
    const errors: string[] = [];

    for (let i = 0; i < daysAhead; i++) {
      const date = addDays(today, i);
      const dayOfWeek = date.getDay(); // 0=Sunday
      const dateStr = toDateStr(date);

      for (const slot of slots) {
        if (slot.dayOfWeek !== dayOfWeek) continue;

        const key = `${batchKey(bandCodes, slot.batchBandId)}|${dateStr}`;
        if (existingKeys.has(key)) continue;

        // Check teacher unavailability
        if (slot.teacherId && blockedDaysByTeacher.get(slot.teacherId)?.has(dateStr)) {
          continue;
        }

        try {
          const startTime = istTimestamp(dateStr, slot.startTimeLocal || '05:30');
          const endTime = istTimestamp(dateStr, slot.endTimeLocal || '06:30');

          const batchCode = bandCodeMap[slot.batchBandId] ?? '';
          const defaultLink = DEFAULT_MEET_LINKS[batchCode] ?? null;

          // Use a deterministic document ID so concurrent calls (e.g. cron +
          // manual trigger) write to the same document instead of creating
          // duplicate records. setDoc overwrites with identical data — no harm.
          const instanceId = `${slot.id}_${dateStr}`;
          await setDoc(COLLECTIONS.CLASS_INSTANCES, instanceId, {
            slotId: slot.id,
            teacherId: slot.teacherId || '',
            batchBandId: slot.batchBandId,
            scheduledStartTime: startTime,
            scheduledEndTime: endTime,
            timezone: slot.timezone || 'Asia/Kolkata',
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
          errors.push(`${dateStr} slot ${slot.id}: ${e instanceof Error ? e.message : 'error'}`);
        }
      }
    }

    return Response.json({
      success: true,
      created,
      slotsFound: slots.length,
      duplicateSlotsDeactivated: slotsDeactivated,
      duplicateClassesRemoved: cleanup.deleted,
      daysScanned: daysAhead,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
