/**
 * API: POST /api/attendance/auto
 *
 * Automatic attendance tracking — called when a student clicks "Join Google Meet".
 * Records join time. If student joins >15 minutes late, marks as absent.
 * If student joins on time, marks as attended. If late (≤15 min), marks as late.
 *
 * This replaces manual teacher attendance marking for the student who joined.
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { createDoc, getDoc, queryDocs, nowISO } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';
import { computeAttendanceViolation } from '@/services/attendance/violation';
import { updateViolationCounter } from '@/services/attendance/counter';
import { writeAuditLog, extractRequestMeta } from '@/services/audit/log';
import { createNotification } from '@/services/notifications/create';
import type { ClassInstance, AppSettings, LongAbsenceRecord, AbsenceRecord, AttendanceRecord } from '@/domain/types';
import type { AttendanceStatus } from '@/domain/enums';
import { z } from 'zod';

const AutoAttendanceSchema = z.object({
  classInstanceId: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['student']);
    const body = await request.json();
    const parsed = AutoAttendanceSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const { classInstanceId } = parsed.data;
    const studentId = auth.uid;

    // Check if attendance already recorded for this class
    const existingAttendance = await queryDocs<AttendanceRecord>(COLLECTIONS.ATTENDANCE_RECORDS, [
      { type: 'where', field: 'studentId', op: '==', value: studentId },
      { type: 'where', field: 'classInstanceId', op: '==', value: classInstanceId },
    ]);

    if (existingAttendance.length > 0) {
      return Response.json({ success: true, message: 'Attendance already recorded', attendanceId: existingAttendance[0].id });
    }

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

    // Calculate lateness using UTC epoch so the result is timezone-independent.
    // scheduledStartTime is an offset-aware ISO string (e.g. 2026-04-16T07:30:00+05:30).
    // Parsing it with new Date() gives the correct UTC epoch on any server timezone.
    const now = Date.now();
    const classStart = new Date(classInstance.scheduledStartTime).getTime();
    const lateByMinutes = Math.max(0, Math.floor((now - classStart) / 60000));

    // Determine attendance status
    let status: AttendanceStatus;
    if (lateByMinutes > 15) {
      status = 'absent'; // >15 min late = absent
    } else if (lateByMinutes > (settings.lateThresholdMinutes || 5)) {
      status = 'late';
    } else {
      status = 'attended';
    }

    // Check for active long approved absence
    const longAbsences = await queryDocs<LongAbsenceRecord>(COLLECTIONS.LONG_ABSENCE_RECORDS, [
      { type: 'where', field: 'studentId', op: '==', value: studentId },
      { type: 'where', field: 'status', op: '==', value: 'approved' },
    ]);
    // Extract YYYY-MM-DD from the IST-offset ISO string for absence record comparison.
    const classDate = classInstance.scheduledStartTime
      ? classInstance.scheduledStartTime.slice(0, 10)
      : new Date(now).toISOString().slice(0, 10);
    const hasActiveLongAbsence = longAbsences.some(
      (la) => la.startDate <= classDate && la.endDate >= classDate
    );

    // Check if absence was notified
    const absenceRecords = await queryDocs<AbsenceRecord>(COLLECTIONS.ABSENCE_RECORDS, [
      { type: 'where', field: 'studentId', op: '==', value: studentId },
      { type: 'where', field: 'classInstanceId', op: '==', value: classInstanceId },
    ]);
    const absenceApproved = absenceRecords.some((a) => a.isApproved);

    // Compute violation
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
      classInstanceId,
      teacherId: classInstance.teacherId || '',
      status,
      markedAt: nowISO(),
      markedBy: 'auto_meet_join',
      lateByMinutes,
      isViolation: violation.isViolation,
      violationReason: violation.reason,
      countedInConsecutiveViolations: violation.countInConsecutive,
      notes: lateByMinutes > 15
        ? `Auto-marked absent: joined ${lateByMinutes} minutes late (>15 min threshold)`
        : lateByMinutes > 0
        ? `Auto-attended: joined ${lateByMinutes} minute${lateByMinutes !== 1 ? 's' : ''} late`
        : 'Auto-attended: joined on time via Google Meet',
    });

    // Update violation counter
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
      actorId: studentId,
      actorRole: 'student',
      action: 'ATTENDANCE_MARKED',
      entityType: 'attendance_record',
      entityId: attendanceId,
      newState: { status, lateByMinutes, autoMarked: true, isViolation: violation.isViolation },
      ipAddress,
      userAgent,
    });

    // Notify if compulsory payment triggered
    if (counterResult.compulsoryTriggered) {
      await createNotification({
        recipientId: studentId,
        type: 'PAYMENT_COMPULSORY_TRIGGERED',
        title: 'Payment Required',
        body: `Your payment has become compulsory due to ${settings.consecutiveViolationThreshold} consecutive class violations. Please upload payment proof.`,
        referenceType: 'monthly_payment_status',
        referenceId: studentId,
      });
    }

    // Auto-mark attendance for dependents (parent-child joining together)
    let dependentAttendanceId: string | undefined;
    const studentProfile = await queryDocs<Record<string, unknown>>(COLLECTIONS.STUDENT_PROFILES, [
      { type: 'where', field: 'userId', op: '==', value: studentId },
    ]);
    const profile = studentProfile[0];

    if (profile?.dependentName) {
      // This student has a dependent linked — also mark attendance for dependent
      // Dependents share the same class instance but are tracked as the parent joining for both
      const dependentNote = `Auto-attended with primary account (${profile.fullName || studentId}). Joined ${lateByMinutes > 0 ? lateByMinutes + ' min late' : 'on time'}.`;
      dependentAttendanceId = await createDoc(COLLECTIONS.ATTENDANCE_RECORDS, {
        studentId: `${studentId}_dependent`, // virtual ID for the dependent
        classInstanceId,
        teacherId: classInstance.teacherId || '',
        status,
        markedAt: nowISO(),
        markedBy: 'auto_dependent',
        lateByMinutes,
        isViolation: false, // dependent violations not tracked separately
        violationReason: null,
        countedInConsecutiveViolations: false,
        notes: dependentNote,
        isDependentRecord: true,
        primaryStudentId: studentId,
        dependentName: profile.dependentName,
      });
    }

    return Response.json({
      success: true,
      attendanceId,
      dependentAttendanceId,
      dependentName: profile?.dependentName || null,
      status,
      lateByMinutes,
      message: lateByMinutes > 15
        ? 'You joined more than 15 minutes late. This is marked as absent.'
        : status === 'late'
        ? `You joined ${lateByMinutes} minutes late. Marked as late.`
        : profile?.dependentName
        ? `Attendance recorded for you and ${profile.dependentName}. Welcome to class!`
        : 'Attendance recorded. Welcome to class!',
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
