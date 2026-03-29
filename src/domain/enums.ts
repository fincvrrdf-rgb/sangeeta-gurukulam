/**
 * domain/enums.ts
 *
 * All enum/union types used across the app. Pure TypeScript — no framework imports.
 * These are the canonical definitions referenced by Firestore documents,
 * API routes, services, and UI components.
 */

// --- User Roles ---
export type UserRole = 'super_admin' | 'teacher' | 'student';

// --- Mastery Stages (ordered progression) ---
// See docs/BUSINESS_RULES.md §2 for stage definitions
export type MasteryStage =
  | 'introduced'
  | 'learning'
  | 'correction'
  | 'practice_pending'
  | 'recording_pending'
  | 'test_due'
  | 'passed'
  | 'revision_needed';

export const MASTERY_STAGE_ORDER: Record<MasteryStage, number> = {
  introduced: 0,
  learning: 1,
  correction: 2,
  practice_pending: 3,
  recording_pending: 4,
  test_due: 5,
  passed: 6,
  revision_needed: 7,
};

// --- Attendance ---
export type AttendanceStatus =
  | 'attended'
  | 'late'
  | 'absent'
  | 'notified_absence'
  | 'no_show'
  | 'teacher_cancelled'
  | 'rescheduled'
  | 'long_approved_absence';

// --- Class Instance Status ---
export type ClassInstanceStatus =
  | 'scheduled'
  | 'live'
  | 'completed'
  | 'cancelled'
  | 'rescheduled';

// --- Class Slot Type ---
export type ClassSlotType = 'morning' | 'evening' | 'testing';

// --- Day of Week (0=Sunday) ---
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

// --- Batch Band Codes ---
export type BatchBandCode = 'A' | 'B' | 'C' | 'D';

// --- Teaching Unit Types ---
export type TeachingUnitType =
  | 'exercise'
  | 'geetham'
  | 'varnam'
  | 'kriti'
  | 'swaravali'
  | 'other';

// --- Booking Status ---
export type BookingStatus =
  | 'booked'
  | 'confirmed'
  | 'cancelled_by_student'
  | 'no_show';

// --- Long Absence ---
export type LongAbsenceReasonCategory =
  | 'vacation'
  | 'travel'
  | 'illness'
  | 'exams'
  | 'family'
  | 'other';

export type LongAbsenceStatus = 'pending' | 'approved' | 'rejected';

// --- Payment ---
export type BillingRegion = 'india' | 'abroad';

export type PaymentStatus =
  | 'not_required'
  | 'optional'
  | 'compulsory'
  | 'proof_submitted'
  | 'pending_review'
  | 'paid'
  | 'waived';

export type PaymentProofStatus =
  | 'pending_review'
  | 'accepted'
  | 'rejected'
  | 'deleted';

export type PaymentAiExtractionStatus = 'draft' | 'reviewed' | 'discarded';

// --- Bhajan ---
export type BhajanSessionStatus =
  | 'upcoming'
  | 'live'
  | 'replay_available'
  | 'cancelled';

// --- Lyrics ---
export type LyricsVerificationStatus =
  | 'draft'
  | 'under_review'
  | 'verified'
  | 'published';

export type AiLyricsDraftType =
  | 'transliteration'
  | 'translation'
  | 'summary'
  | 'search_result';

export type AiLyricsDraftStatus = 'draft' | 'accepted' | 'discarded';

// --- Lesson Plans ---
export type LessonPlanStatus =
  | 'draft'
  | 'in_progress'
  | 'completed'
  | 'confirmed';

// --- Practice Recordings ---
export type RecordingStatus = 'draft' | 'submitted' | 'reviewed';

export type RecordingReviewStatus =
  | 'accepted'
  | 'needs_improvement'
  | 'incomplete';

// --- Assessments ---
export type AssessmentType = 'regular' | 'testing_day';

export type AssessmentResult = 'pass' | 'fail' | 'retry' | 'revise';

// --- Pitch Check ---
export type PitchCheckResult =
  | 'correct'
  | 'close'
  | 'off_pitch'
  | 'unstable'
  | 'unreliable';

// --- Weekly Reports ---
export type WeeklyReportStatus =
  | 'ai_draft'
  | 'teacher_reviewed'
  | 'published';

export type AiFeedbackDraftStatus =
  | 'pending_review'
  | 'accepted'
  | 'rejected'
  | 'edited_and_accepted';

// --- Devotional Calendar ---
export type DevotionalEventType =
  | 'festival'
  | 'vrat'
  | 'observance'
  | 'tithi'
  | 'other';

// --- Notifications ---
export type NotificationType =
  | 'CLASS_UPCOMING'
  | 'CLASS_STARTING_SOON'
  | 'CLASS_CANCELLED'
  | 'CLASS_RESCHEDULED'
  | 'BHAJAN_UPCOMING'
  | 'BHAJAN_LIVE'
  | 'BHAJAN_CANCELLED'
  | 'PAYMENT_PROOF_SUBMITTED'
  | 'PAYMENT_PROOF_REVIEWED'
  | 'PAYMENT_COMPULSORY_TRIGGERED'
  | 'LONG_ABSENCE_SUBMITTED'
  | 'LONG_ABSENCE_APPROVED'
  | 'LONG_ABSENCE_REJECTED'
  | 'PLANNING_INCOMPLETE'
  | 'LYRICS_VERIFICATION_NEEDED'
  | 'RIYAZ_REMINDER'
  | 'PRANAYAMA_REMINDER'
  | 'PRACTICE_RECORDING_PENDING'
  | 'TESTING_DAY_UPCOMING'
  | 'WEEKLY_REPORT_AVAILABLE'
  | 'CLASS_REMINDER'
  | 'LESSON_PLAN_REMINDER'
  | 'ABSENCE_SUBMITTED'
  | 'WEEKLY_REPORT_NEEDS_REVIEW'
  | 'RECORDING_REVIEWED'
  | 'RECORDING_SUBMITTED'
  | 'NEW_STUDENT_ENROLLED'
  | 'STUDENT_PROGRESSED'
  | 'ABSENCE_SUBMITTED';

export type NotificationChannel = 'in_app' | 'email';

// --- Teacher Availability ---
export type AvailabilityBlockReason =
  | 'personal'
  | 'work'
  | 'illness'
  | 'festival'
  | 'other';

// --- Syllabus Book License ---
export type BookLicenseStatus =
  | 'under_review'
  | 'no_reproduction'
  | 'teacher_authored_only';

// --- Resource Visibility ---
export type ResourceVisibility =
  | 'teacher_only'
  | 'assigned_batch'
  | 'all_students';

// --- Audit Actions (critical mutations that must be logged) ---
export type AuditAction =
  | 'USER_ROLE_CHANGED'
  | 'STUDENT_PLACED'
  | 'STUDENT_ONBOARDED'
  | 'STUDENT_PROGRESSED'
  | 'ATTENDANCE_MARKED'
  | 'VIOLATION_COUNTER_UPDATED'
  | 'PAYMENT_COMPULSORY_TRIGGERED'
  | 'PAYMENT_STATUS_CHANGED'
  | 'PAYMENT_PROOF_REVIEWED'
  | 'PAYMENT_PROOF_SUBMITTED'
  | 'PAYMENT_WAIVED'
  | 'RECORDING_REVIEWED'
  | 'RECORDING_SUBMITTED'
  | 'PITCH_CHECK_REQUESTED'
  | 'ASSESSMENT_CREATED'
  | 'ASSESSMENT_UPDATED'
  | 'LYRICS_CREATED'
  | 'LYRICS_UPDATED'
  | 'LYRICS_PUBLISHED'
  | 'AI_LYRICS_DRAFT_CREATED'
  | 'LESSON_PLAN_CREATED'
  | 'LESSON_PLAN_UPDATED'
  | 'LESSON_PLAN_CONFIRMED'
  | 'LESSON_PLAN_ITEM_ADDED'
  | 'CLASS_SLOT_CREATED'
  | 'CLASS_INSTANCE_CREATED'
  | 'CLASS_INSTANCE_CANCELLED'
  | 'CLASS_CANCELLED'
  | 'CLASS_RESCHEDULED'
  | 'MEET_LINK_CREATED'
  | 'BHAJAN_SESSION_CREATED'
  | 'BHAJAN_SESSION_UPDATED'
  | 'LONG_ABSENCE_SUBMITTED'
  | 'LONG_ABSENCE_APPROVED'
  | 'LONG_ABSENCE_REJECTED'
  | 'WEEKLY_REPORT_PUBLISHED'
  | 'APP_SETTINGS_CHANGED'
  | 'APP_SETTINGS_UPDATED'
  | 'SYLLABUS_ITEM_CREATED'
  | 'SYLLABUS_ITEM_UPDATED'
  | 'BATCH_BAND_UPDATED'
  | 'DEVOTIONAL_EVENT_CREATED'
  | 'RUBRIC_CREATED'
  | 'TEACHER_CALENDAR_CONNECTED'
  | 'BHAJAN_CANCELLED'
  | 'ABSENCE_SUBMITTED'
  | 'LONG_ABSENCE_SUBMITTED'
  | 'PAYMENT_PROOF_SUBMITTED'
  | 'DEVOTIONAL_CALENDAR_AI_FETCH'
  | 'CLASS_INSTANCE_UPDATED';
