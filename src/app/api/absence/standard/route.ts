/**
 * API: POST /api/absence/standard
 *
 * Student marks a standard (single-class) absence. Must be submitted
 * at least absenceNoticeHoursBeforeClass hours before the class starts.
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { createDoc, getDoc, nowISO } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';
import { writeAuditLog, extractRequestMeta } from '@/services/audit/log';
import type { ClassInstance, AppSettings } from '@/domain/types';
import { z } from 'zod';

const StandardAbsenceSchema = z.object({
  classInstanceId: z.string().min(1),
  reason: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['student']);
    const body = await request.json();
    const parsed = StandardAbsenceSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const { classInstanceId, reason } = parsed.data;

    // Load class instance and settings
    const [classInstance, settings] = await Promise.all([
      getDoc<ClassInstance>(COLLECTIONS.CLASS_INSTANCES, classInstanceId),
      getDoc<AppSettings>(COLLECTIONS.APP_SETTINGS, 'global'),
    ]);

    if (!classInstance) {
      return Response.json({ error: 'Class instance not found' }, { status: 404 });
    }

    if (!settings) {
      return Response.json({ error: 'App settings not found' }, { status: 500 });
    }

    // Validate notice period
    const now = new Date();
    const classStart = new Date(classInstance.scheduledStartTime);
    const hoursBeforeClass = (classStart.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (hoursBeforeClass < settings.absenceNoticeHoursBeforeClass) {
      return Response.json(
        {
          error: `Absence must be submitted at least ${settings.absenceNoticeHoursBeforeClass} hours before class. Only ${Math.max(0, Math.round(hoursBeforeClass * 10) / 10)} hours remain.`,
        },
        { status: 400 }
      );
    }

    // Create absence record
    const absenceId = await createDoc(COLLECTIONS.ABSENCE_RECORDS, {
      studentId: auth.uid,
      classInstanceId,
      submittedAt: nowISO(),
      reason,
      hoursBeforeClass: Math.round(hoursBeforeClass * 10) / 10,
      isApproved: true,
      approvedBy: null,
      approvedAt: null,
      countAsViolation: false,
    });

    // Audit log
    const { ipAddress, userAgent } = extractRequestMeta(request);
    await writeAuditLog({
      actorId: auth.uid,
      actorRole: auth.role,
      action: 'ABSENCE_SUBMITTED',
      entityType: 'absence_record',
      entityId: absenceId,
      newState: { classInstanceId, reason, hoursBeforeClass },
      ipAddress,
      userAgent,
    });

    return Response.json({ success: true, absenceId });
  } catch (error) {
    return authErrorResponse(error);
  }
}
