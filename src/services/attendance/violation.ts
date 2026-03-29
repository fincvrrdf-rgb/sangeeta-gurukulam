/**
 * services/attendance/violation.ts
 *
 * Pure function that computes whether an attendance event constitutes a violation.
 * This is the core of the payment rules engine.
 *
 * HARD RULES (never configurable, never overridden):
 *   - teacher_cancelled → NEVER a violation
 *   - long_approved_absence → NEVER a violation
 *
 * See docs/BUSINESS_RULES.md §5 for full specification.
 */

import type { AttendanceStatus } from '@/domain/enums';
import type { AppSettings } from '@/domain/types';

export interface ViolationInput {
  attendanceStatus: AttendanceStatus;
  classWasCancelledByTeacher: boolean;
  studentHasActiveLongApprovedAbsence: boolean;
  absenceWasNotifiedAndApproved: boolean;
}

export interface ViolationResult {
  isViolation: boolean;
  reason: string | null;
  countInConsecutive: boolean;
}

/**
 * Compute whether an attendance event is a payment violation.
 *
 * This is a PURE function — no side effects, no Firestore calls.
 * All inputs are pre-fetched and passed in by the calling API route.
 */
export function computeAttendanceViolation(
  input: ViolationInput,
  settings: AppSettings
): ViolationResult {
  const { attendanceStatus, classWasCancelledByTeacher, studentHasActiveLongApprovedAbsence, absenceWasNotifiedAndApproved } = input;

  // HARD RULE: Teacher-cancelled classes are NEVER violations.
  if (classWasCancelledByTeacher) {
    return { isViolation: false, reason: null, countInConsecutive: false };
  }

  // HARD RULE: Active approved long absences are NEVER violations.
  if (studentHasActiveLongApprovedAbsence) {
    return { isViolation: false, reason: null, countInConsecutive: false };
  }

  // Attended on time: not a violation.
  if (attendanceStatus === 'attended') {
    return { isViolation: false, reason: null, countInConsecutive: false };
  }

  // Teacher-cancelled status on the attendance record itself (redundant safety check).
  if (attendanceStatus === 'teacher_cancelled') {
    return { isViolation: false, reason: null, countInConsecutive: false };
  }

  // Rescheduled: not a violation.
  if (attendanceStatus === 'rescheduled') {
    return { isViolation: false, reason: null, countInConsecutive: false };
  }

  // Long approved absence status on the attendance record (redundant safety check).
  if (attendanceStatus === 'long_approved_absence') {
    return { isViolation: false, reason: null, countInConsecutive: false };
  }

  // Late: always a violation.
  if (attendanceStatus === 'late') {
    return { isViolation: true, reason: 'late_join', countInConsecutive: true };
  }

  // Notified absence: depends on approval status and settings.
  if (attendanceStatus === 'notified_absence') {
    if (absenceWasNotifiedAndApproved && !settings.approvedAbsenceCountsAsViolation) {
      return { isViolation: false, reason: null, countInConsecutive: false };
    }
    return { isViolation: true, reason: 'notified_absence_counted', countInConsecutive: true };
  }

  // Absent or no-show: always a violation.
  if (attendanceStatus === 'absent' || attendanceStatus === 'no_show') {
    return { isViolation: true, reason: attendanceStatus, countInConsecutive: true };
  }

  // Fallback: unknown status, do not count.
  return { isViolation: false, reason: null, countInConsecutive: false };
}
