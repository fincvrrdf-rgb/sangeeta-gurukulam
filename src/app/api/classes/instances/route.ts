/**
 * API: /api/classes/instances
 *
 * GET  — List class instances for a date range (query params: from, to, slotId?)
 * POST — Create a class instance manually (teacher/admin)
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { createDoc, getDoc, queryDocs, nowISO } from '@/lib/firebase/firestore';
import { writeAuditLog, extractRequestMeta } from '@/services/audit/log';
import { COLLECTIONS } from '@/domain/constants';
import type { ClassInstance, ClassSlot } from '@/domain/types';
import type { QueryConstraint } from '@/lib/firebase/firestore';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const CreateInstanceSchema = z.object({
  slotId: z.string().min(1),
  scheduledDate: z.string().min(1),
  scheduledStartTime: z.string().min(1),
  scheduledEndTime: z.string().min(1),
});

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['student', 'teacher', 'super_admin']);

    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const slotId = searchParams.get('slotId');

    if (!from || !to) {
      return Response.json({ error: 'Missing required query params: from, to' }, { status: 400 });
    }

    // Normalise date range: treat bare dates as IST day boundaries
    const fromStr = from.length === 10 ? `${from}T00:00:00+05:30` : from;
    const toStr = to.length === 10 ? `${to}T23:59:59+05:30` : to;

    const constraints: QueryConstraint[] = [
      { type: 'where', field: 'scheduledStartTime', op: '>=', value: fromStr },
      { type: 'where', field: 'scheduledStartTime', op: '<=', value: toStr },
    ];

    if (slotId) {
      constraints.push({ type: 'where', field: 'slotId', op: '==', value: slotId });
    }

    let instances = await queryDocs<ClassInstance>(COLLECTIONS.CLASS_INSTANCES, constraints);

    const DEFAULT_MEET_LINKS: Record<string, string> = {
      A: 'https://meet.google.com/spv-exsq-sfm',
      B: 'https://meet.google.com/spv-exsq-sfm',
      C: 'https://meet.google.com/iyq-wdqw-cfj',
      D: 'https://meet.google.com/iyq-wdqw-cfj',
    };

    // Step 1: resolve ALL batchBandId → code BEFORE filtering (needed for fallback match)
    const allBandIds = [...new Set(instances.map((i) => i.batchBandId).filter(Boolean))];
    const batchCodeMap: Record<string, string> = {};
    for (const bandId of allBandIds) {
      const band = await getDoc<Record<string, unknown>>(COLLECTIONS.BATCH_BANDS, bandId);
      if (band) batchCodeMap[bandId] = band.code as string;
    }

    // Step 2: role-based filtering
    if (auth.role === 'teacher') {
      instances = instances.filter((i) => i.teacherId === auth.uid);
    } else if (auth.role === 'student') {
      // getDoc by UID — student profile doc ID always equals user UID
      const studentProfile = await getDoc<Record<string, unknown>>(COLLECTIONS.STUDENT_PROFILES, auth.uid);
      const batchBandId = (studentProfile?.currentBatchBandId as string) || '';

      if (!batchBandId) {
        return Response.json({ success: true, instances: [], noBatch: true });
      }

      // Resolve student's batch code (may not be in batchCodeMap if student has no instances yet)
      const studentBatchCode = batchCodeMap[batchBandId]
        || ((await getDoc<Record<string, unknown>>(COLLECTIONS.BATCH_BANDS, batchBandId))?.code as string | undefined)
        || '';

      instances = instances.filter((i) => {
        // Primary match: exact batchBandId
        if (i.batchBandId === batchBandId) return true;
        // Fallback: same batch code (handles re-seeded IDs)
        if (studentBatchCode && batchCodeMap[i.batchBandId] === studentBatchCode) return true;
        return false;
      });
    }

    // Step 3: compute enrolled learner count per batch (students + co-learners)
    const enrolledByBatch: Record<string, number> = {};
    if (instances.length > 0) {
      const allProfiles = await queryDocs<Record<string, unknown>>(COLLECTIONS.STUDENT_PROFILES, []);
      for (const p of allProfiles) {
        if (p.isActive === false) continue;
        const bid = p.currentBatchBandId as string;
        if (!bid) continue;
        enrolledByBatch[bid] = (enrolledByBatch[bid] ?? 0) + 1;
        if (p.dependentName) enrolledByBatch[bid] += 1; // co-learner
      }
    }

    // Step 4: attach batch code + meet link + enrolled count to every instance
    instances = instances.map((i) => {
      const raw = i as unknown as Record<string, unknown>;
      const code = batchCodeMap[i.batchBandId] ?? (raw.batchBand as string) ?? '';
      const instanceLink = (raw.meetLink as string) || (raw.googleMeetLink as string) || '';
      const link = instanceLink || DEFAULT_MEET_LINKS[code] || null;
      const enrolledCount = enrolledByBatch[i.batchBandId] ?? 0;
      return { ...i, batchBand: code, meetLink: link, googleMeetLink: link, enrolledCount };
    });

    return Response.json({ success: true, instances });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['teacher', 'super_admin']);
    const body = await request.json();
    const parsed = CreateInstanceSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const { slotId, scheduledDate, scheduledStartTime, scheduledEndTime } = parsed.data;

    // Verify slot exists
    const slot = await getDoc<ClassSlot>(COLLECTIONS.CLASS_SLOTS, slotId);
    if (!slot) {
      return Response.json({ error: 'Class slot not found' }, { status: 404 });
    }

    const instanceId = await createDoc(COLLECTIONS.CLASS_INSTANCES, {
      slotId,
      teacherId: slot.teacherId,
      batchBandId: slot.batchBandId,
      scheduledStartTime,
      scheduledEndTime,
      timezone: slot.timezone,
      status: 'scheduled',
      cancellationReason: null,
      rescheduleTargetInstanceId: null,
      googleMeetLink: null,
      googleCalendarEventId: null,
      lessonPlanItemId: null,
      teachingUnitId: null,
      notifiedCancellation: false,
    });

    const { ipAddress, userAgent } = extractRequestMeta(request);
    await writeAuditLog({
      actorId: auth.uid,
      actorRole: auth.role,
      action: 'CLASS_INSTANCE_CREATED',
      entityType: 'class_instance',
      entityId: instanceId,
      newState: { slotId, scheduledDate, scheduledStartTime, scheduledEndTime },
      ipAddress,
      userAgent,
    });

    return Response.json({ success: true, instanceId });
  } catch (error) {
    return authErrorResponse(error);
  }
}
