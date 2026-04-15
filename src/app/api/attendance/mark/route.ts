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

// Single record — canonical statuses used internally
const SingleAttendanceSchema = z.object({
  studentId: z.string().min(1),
  classInstanceId: z.string().min(1),
  // Accept both UI-friendly aliases (present, did_not_show) and canonical values
  status: z.enum([
    'present', 'attended', 'late', 'absent', 'did_not_show', 'no_show',
    'notified_absence', 'teacher_cancelled', 'rescheduled', 'long_approved_absence',
  ]),
  lateByMinutes: z.number().min(0).default(0),
  notes: z.string().default(''),
  bookingId: z.string().optional(),
});

// Batch form — what the teacher attendance page sends
const BatchAttendanceSchema = z.object({
  records: z.array(SingleAttendanceSchema).min(1),
});

const MarkAttendanceSchema = z.union([SingleAttendanceSchema, BatchAttendanceSchema]);

// UI status aliases → canonical AttendanceStatus enum values
const STATUS_ALIASES: Record<string, AttendanceStatus> = {
  present: 'attended',
  did_not_show: 'no_show',
};

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['teacher', 'super_admin']);
    const body = await request.json();
    const parsed = MarkAttendanceSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    // Normalize: both single and batch shapes are processed the same way
    type ParsedData = typeof parsed.data;
    type BatchData = { records: Array<{ studentId: string; classInstanceId: string; status: string; lateByMinutes: number; notes: string; bookingId?: string }> };
    const isBatch = 'records' in parsed.data;
    const records = isBatch
      ? (parsed.data as unknown as BatchData).records
      : [parsed.data as Exclude<ParsedData, BatchData>];

    const { ipAddress, userAgent } = extractRequestMeta(request);
    const results: Array<{
      attendanceId: string;
      studentId: string;
      isViolation: boolean;
      consecutiveCount: number;
      compulsoryTriggered: boolean;
    }> = [];

    // We load classInstance and settings once — all records in a batch are for the same class
    const classInstanceId = records[0].classInstanceId;
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

    for (const record of records) {
      const { studentId, lateByMinutes, notes, bookingId } = record;
      // Map UI-friendly aliases to canonical enum values
      const status = (STATUS_ALIASES[record.status] ?? record.status) as AttendanceStatus;

      // Check for active long approved absence
      const longAbsences = await queryDocs<LongAbsenceRecord>(COLLECTIONS.LONG_ABSENCE_RECORDS, [
        { type: 'where', field: 'studentId', op: '==', value: studentId },
        { type: 'where', field: 'status', op: '==', value: 'approved' },
      ]);
      const classDate = classInstance.scheduledStartTime
        ? classInstance.scheduledStartTime.slice(0, 10)
        : '';
      const hasActiveLongAbsence = longAbsences.some(
        (la) => la.startDate <= classDate && la.endDate >= classDate
      );

      // Check if absence was notified and approved
      const absenceRecords = await queryDocs<AbsenceRecord>(COLLECTIONS.ABSENCE_RECORDS, [
        { type: 'where', field: 'studentId', op: '==', value: studentId },
        { type: 'where', field: 'classInstanceId', op: '==', value: record.classInstanceId },
      ]);
      const absenceApproved = absenceRecords.some((a) => a.isApproved);

      // Compute violation (pure function)
      const violation = computeAttendanceViolation(
        {
          attendanceStatus: status,
          classWasCancelledByTeacher: classInstance.status === 'cancelled',
          studentHasActiveLongApprovedAbsence: hasActiveLongAbsence,
          absenceWasNotifiedAndApproved: absenceApproved,
        },
        settings
      );

      // Create attendance record
      const attendanceId = await createDoc(COLLECTIONS.ATTENDANCE_RECORDS, {
        studentId,
        classInstanceId: record.classInstanceId,
        teacherId: auth.uid,
        status,
        markedAt: nowISO(),
        markedBy: auth.uid,
        lateByMinutes,
        isViolation: violation.isViolation,
        violationReason: violation.reason,
        countedInConsecutiveViolations: violation.countInConsecutive,
        notes,
        ...(bookingId ? { bookingId } : {}),
      });

      // Update violation counter (transactional)
      const counterResult = await updateViolationCounter({
        studentId,
        classInstanceId: record.classInstanceId,
        isViolation: violation.isViolation,
        violationReason: violation.reason,
        settings,
      });

      // Audit log
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

      results.push({
        attendanceId,
        studentId,
        isViolation: violation.isViolation,
        consecutiveCount: counterResult.newCount,
        compulsoryTriggered: counterResult.compulsoryTriggered,
      });
    }

    // Return batch results; for single-record callers, also include top-level fields for compat
    const first = results[0];
    return Response.json({
      success: true,
      results,
      // Backwards-compatible single-record fields
      attendanceId: first.attendanceId,
      isViolation: first.isViolation,
      consecutiveCount: first.consecutiveCount,
      compulsoryTriggered: first.compulsoryTriggered,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
