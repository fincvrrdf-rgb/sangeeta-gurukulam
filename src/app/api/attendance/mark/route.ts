/**
 * API: POST /api/attendance/mark
 *
 * Teacher marks attendance for a student in a class instance.
 * This is the entry point for the entire payment violation engine.
 *
 * Flow:
 *   1. Validate input and auth (teacher or super_admin)
 *   2. Compute violation status (pure function)
 *   3. Create attendance record
 *   4. Update violation counter (transactional)
 *   5. If threshold reached → trigger compulsory payment (within same transaction)
 *   6. Write audit log
 *   7. Send notifications if needed
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { createDoc, getDoc, queryDocs, nowISO } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';
import { computeAttendanceViolation } from '@/services/attendance/violation';
import { updateViolationCounter } from '@/services/attendance/counter';
import { writeAuditLog, extractRequestMeta } from '@/services/audit/log';
import { createNotification } from '@/services/notifications/create';
import type { ClassInstance, AppSettings, LongAbsenceRecord, AbsenceRecord } from '@/domain/types';
import type { AttendanceStatus } from '@/domain/enums';
import type { QueryConstraint } from '@/lib/firebase/firestore';
import { z } from 'zod';

/**
 * GET /api/attendance/mark — Student's own attendance history
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['student', 'teacher', 'super_admin']);

    const studentId = auth.role === 'student'
      ? auth.uid
      : request.nextUrl.searchParams.get('studentId') ?? auth.uid;

    const constraints: QueryConstraint[] = [
      { type: 'where', field: 'studentId', op: '==', value: studentId },
    ];

    const records = await queryDocs<Record<string, unknown>>(COLLECTIONS.ATTENDANCE_RECORDS, constraints);

    // Sort by markedAt descending client-side to avoid composite index
    records.sort((a, b) =>
      String(b.markedAt ?? '').localeCompare(String(a.markedAt ?? ''))
    );

    // Map to the shape the frontend expects
    const attendanceRecords = records.slice(0, 50).map((r) => ({
      id: r.id,
      date: r.markedAt ?? r.createdAt ?? '',
      className: `Class ${r.classInstanceId ?? ''}`.slice(0, 30),
      status: r.isViolation ? 'violation' : (r.status ?? 'present'),
      notes: r.notes ?? null,
    }));

    return Response.json({ records: attendanceRecords });
  } catch (error) {
    return authErrorResponse(error);
  }
}

const MarkAttendanceSchema = z.object({
  studentId: z.string().min(1),
  classInstanceId: z.string().min(1),
  status: z.enum([
    'attended', 'late', 'absent', 'notified_absence', 'no_show',
    'teacher_cancelled', 'rescheduled', 'long_approved_absence',
  ]),
  lateByMinutes: z.number().min(0).default(0),
  notes: z.string().default(''),
});

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['teacher', 'super_admin']);
    const body = await request.json();
    const parsed = MarkAttendanceSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const { studentId, classInstanceId, status, lateByMinutes, notes } = parsed.data;

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

    // Check for active long approved absence
    const longAbsences = await queryDocs<LongAbsenceRecord>(COLLECTIONS.LONG_ABSENCE_RECORDS, [
      { type: 'where', field: 'studentId', op: '==', value: studentId },
      { type: 'where', field: 'status', op: '==', value: 'approved' },
    ]);
    const classDate = classInstance.scheduledStartTime;
    const hasActiveLongAbsence = longAbsences.some(
      (la) => la.startDate <= classDate && la.endDate >= classDate
    );

    // Check if absence was notified and approved
    const absenceRecords = await queryDocs<AbsenceRecord>(COLLECTIONS.ABSENCE_RECORDS, [
      { type: 'where', field: 'studentId', op: '==', value: studentId },
      { type: 'where', field: 'classInstanceId', op: '==', value: classInstanceId },
    ]);
    const absenceApproved = absenceRecords.some((a) => a.isApproved);

    // Compute violation (pure function)
    const violation = computeAttendanceViolation(
      {
        attendanceStatus: status as AttendanceStatus,
        classWasCancelledByTeacher: classInstance.status === 'cancelled',
        studentHasActiveLongApprovedAbsence: hasActiveLongAbsence,
        absenceWasNotifiedAndApproved: absenceApproved,
      },
      settings
    );

    // Create attendance record
    const attendanceId = await createDoc(COLLECTIONS.ATTENDANCE_RECORDS, {
      studentId,
      classInstanceId,
      teacherId: auth.uid,
      status,
      markedAt: nowISO(),
      markedBy: auth.uid,
      lateByMinutes,
      isViolation: violation.isViolation,
      violationReason: violation.reason,
      countedInConsecutiveViolations: violation.countInConsecutive,
      notes,
    });

    // Update violation counter (transactional)
    const counterResult = await updateViolationCounter({
      studentId,
      classInstanceId,
      isViolation: violation.isViolation,
      violationReason: violation.reason,
      settings,
    });

    // Audit log
    const { ipAddress, userAgent } = extractRequestMeta(request);
    await writeAuditLog({
      actorId: auth.uid,
      actorRole: auth.role,
      action: 'ATTENDANCE_MARKED',
      entityType: 'attendance_record',
      entityId: attendanceId,
      newState: { status, isViolation: violation.isViolation, consecutiveCount: counterResult.newCount },
      ipAddress,
      userAgent,
    });

    // Notify student if compulsory payment was triggered
    if (counterResult.compulsoryTriggered) {
      await createNotification({
        recipientId: studentId,
        type: 'PAYMENT_COMPULSORY_TRIGGERED',
        title: 'Payment Required',
        body: `Your payment has become compulsory due to ${settings.consecutiveViolationThreshold} consecutive class violations. Please upload payment proof.`,
        referenceType: 'monthly_payment_status',
        referenceId: studentId,
      });

      await writeAuditLog({
        actorId: 'system',
        actorRole: 'super_admin',
        action: 'PAYMENT_COMPULSORY_TRIGGERED',
        entityType: 'student_profile',
        entityId: studentId,
        newState: { consecutiveCount: counterResult.newCount, threshold: settings.consecutiveViolationThreshold },
        ipAddress,
        userAgent,
      });
    }

    return Response.json({
      success: true,
      attendanceId,
      isViolation: violation.isViolation,
      violationReason: violation.reason,
      consecutiveCount: counterResult.newCount,
      compulsoryTriggered: counterResult.compulsoryTriggered,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
