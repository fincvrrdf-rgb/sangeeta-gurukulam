/**
 * POST /api/admin/bootstrap
 *
 * One-shot bootstrap: seeds batch bands, creates default class slots,
 * and generates class instances for the next 30 days.
 * No auth required — safe to call when admin is locked out.
 * Idempotent — skips anything that already exists.
 */

import { adminAuth } from '@/lib/firebase/admin';
import { queryDocs, createDoc, nowISO } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';

const SUPER_ADMIN_EMAIL = 'sangeetagurukulam0@gmail.com';

const STANDARD_BATCHES = [
  { code: 'A', name: 'Batch A — Mon/Wed Morning', description: 'Monday & Wednesday 5:30–6:30 AM IST' },
  { code: 'B', name: 'Batch B — Mon/Wed Evening', description: 'Monday & Wednesday 4:30–5:30 PM IST' },
  { code: 'C', name: 'Batch C — Tue/Thu Morning', description: 'Tuesday & Thursday 5:30–6:30 AM IST' },
  { code: 'D', name: 'Batch D — Tue/Thu Evening', description: 'Tuesday & Thursday 4:30–5:30 PM IST' },
];

// dayOfWeek: 1=Mon, 2=Tue, 3=Wed, 4=Thu
const SLOT_TEMPLATES = [
  { batchCode: 'A', dayOfWeek: 1, start: '05:30', end: '06:30' },
  { batchCode: 'A', dayOfWeek: 3, start: '05:30', end: '06:30' },
  { batchCode: 'B', dayOfWeek: 1, start: '16:30', end: '17:30' },
  { batchCode: 'B', dayOfWeek: 3, start: '16:30', end: '17:30' },
  { batchCode: 'C', dayOfWeek: 2, start: '05:30', end: '06:30' },
  { batchCode: 'C', dayOfWeek: 4, start: '05:30', end: '06:30' },
  { batchCode: 'D', dayOfWeek: 2, start: '16:30', end: '17:30' },
  { batchCode: 'D', dayOfWeek: 4, start: '16:30', end: '17:30' },
];

const DEFAULT_MEET_LINKS: Record<string, string> = {
  A: 'https://meet.google.com/spv-exsq-sfm',
  B: 'https://meet.google.com/spv-exsq-sfm',
  C: 'https://meet.google.com/iyq-wdqw-cfj',
  D: 'https://meet.google.com/iyq-wdqw-cfj',
};

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function istTimestamp(dateStr: string, timeHHMM: string): string {
  return `${dateStr}T${timeHHMM}:00+05:30`;
}

export async function POST() {
  const report: Record<string, unknown> = {};

  try {
    // 1. Get super admin UID
    let adminUid = 'system';
    try {
      const adminUser = await adminAuth.getUserByEmail(SUPER_ADMIN_EMAIL);
      adminUid = adminUser.uid;
      // Also re-enable if disabled
      if (adminUser.disabled) {
        await adminAuth.updateUser(adminUid, { disabled: false });
        await adminAuth.setCustomUserClaims(adminUid, { role: 'super_admin' });
        report.adminReenabled = true;
      }
    } catch {
      report.adminLookupSkipped = true;
    }

    // 2. Seed batch bands
    const existingBands = await queryDocs<Record<string, unknown>>(COLLECTIONS.BATCH_BANDS, []);
    const existingCodes = new Set(existingBands.map((b) => b.code as string));
    const bandIdMap: Record<string, string> = {};

    // Map existing bands
    for (const band of existingBands) {
      bandIdMap[band.code as string] = band.id as string;
    }

    let bandsCreated = 0;
    for (const batch of STANDARD_BATCHES) {
      if (!existingCodes.has(batch.code)) {
        const id = await createDoc(COLLECTIONS.BATCH_BANDS, {
          code: batch.code,
          name: batch.name,
          description: batch.description,
          lessonIdFrom: '',
          lessonIdTo: '',
          teachingUnitScopeNote: null,
          assignedTeacherId: '',
          isActive: true,
          maxCapacityPerSlot: 10,
          createdAt: nowISO(),
          updatedAt: nowISO(),
        });
        bandIdMap[batch.code] = id;
        bandsCreated++;
      }
    }
    report.bandsCreated = bandsCreated;

    // 3. Seed class slots
    const existingSlots = await queryDocs<Record<string, unknown>>(COLLECTIONS.CLASS_SLOTS, []);
    const slotIdMap: Record<string, string> = {}; // "batchCode|dayOfWeek" → slotId

    for (const slot of existingSlots) {
      // Find which batch code this slot belongs to
      const bandId = slot.batchBandId as string;
      const code = Object.keys(bandIdMap).find((c) => bandIdMap[c] === bandId);
      if (code) {
        slotIdMap[`${code}|${slot.dayOfWeek}`] = slot.id as string;
      }
    }

    let slotsCreated = 0;
    for (const tmpl of SLOT_TEMPLATES) {
      const key = `${tmpl.batchCode}|${tmpl.dayOfWeek}`;
      if (slotIdMap[key]) continue; // already exists
      const batchBandId = bandIdMap[tmpl.batchCode];
      if (!batchBandId) continue;

      const slotId = await createDoc(COLLECTIONS.CLASS_SLOTS, {
        teacherId: adminUid,
        batchBandId,
        dayOfWeek: tmpl.dayOfWeek,
        startTimeLocal: tmpl.start,
        endTimeLocal: tmpl.end,
        timezone: 'Asia/Kolkata',
        slotType: 'regular',
        recurrenceRule: '',
        maxCapacity: 10,
        isActive: true,
        createdBy: adminUid,
        createdAt: nowISO(),
        updatedAt: nowISO(),
      });
      slotIdMap[key] = slotId;
      slotsCreated++;
    }
    report.slotsCreated = slotsCreated;

    // 4. Generate class instances for next 30 days
    const daysAhead = 30;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const rangeEnd = addDays(today, daysAhead);

    const existingInstances = await queryDocs<Record<string, unknown>>(COLLECTIONS.CLASS_INSTANCES, [
      { type: 'where', field: 'scheduledStartTime', op: '>=', value: toDateStr(today) },
      { type: 'where', field: 'scheduledStartTime', op: '<=', value: toDateStr(rangeEnd) + 'T23:59:59' },
    ]);

    const existingKeys = new Set<string>();
    for (const inst of existingInstances) {
      const dateStr = (inst.scheduledStartTime as string).slice(0, 10);
      existingKeys.add(`${inst.slotId}|${dateStr}`);
    }

    // Build full slot list (existing + newly created)
    const allSlots = await queryDocs<Record<string, unknown>>(COLLECTIONS.CLASS_SLOTS, [
      { type: 'where', field: 'isActive', op: '==', value: true },
    ]);

    let instancesCreated = 0;
    for (let i = 0; i < daysAhead; i++) {
      const date = addDays(today, i);
      const dayOfWeek = date.getDay();
      const dateStr = toDateStr(date);

      for (const slot of allSlots) {
        if ((slot.dayOfWeek as number) !== dayOfWeek) continue;
        const key = `${slot.id}|${dateStr}`;
        if (existingKeys.has(key)) continue;

        // Find batch code for this slot's batchBandId
        const batchCode = Object.keys(bandIdMap).find(
          (c) => bandIdMap[c] === (slot.batchBandId as string)
        ) ?? '';
        const meetLink = DEFAULT_MEET_LINKS[batchCode] ?? null;

        await createDoc(COLLECTIONS.CLASS_INSTANCES, {
          slotId: slot.id,
          teacherId: slot.teacherId || adminUid,
          batchBandId: slot.batchBandId,
          scheduledStartTime: istTimestamp(dateStr, (slot.startTimeLocal as string) || '05:30'),
          scheduledEndTime: istTimestamp(dateStr, (slot.endTimeLocal as string) || '06:30'),
          timezone: 'Asia/Kolkata',
          status: 'scheduled',
          cancellationReason: null,
          rescheduleTargetInstanceId: null,
          googleMeetLink: meetLink,
          meetLink: meetLink,
          googleCalendarEventId: null,
          lessonPlanItemId: null,
          teachingUnitId: null,
          notifiedCancellation: false,
          autoGenerated: true,
          generatedBy: adminUid,
          createdAt: nowISO(),
          updatedAt: nowISO(),
        });
        existingKeys.add(key);
        instancesCreated++;
      }
    }
    report.instancesCreated = instancesCreated;
    report.success = true;

    return Response.json({
      success: true,
      message: `Bootstrap complete. Bands: +${bandsCreated}, Slots: +${slotsCreated}, Instances: +${instancesCreated} (next 30 days).`,
      ...report,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Bootstrap failed';
    return Response.json({ success: false, error: msg, ...report }, { status: 500 });
  }
}
