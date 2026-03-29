/**
 * domain/constants.ts
 *
 * Default values, seed data constants, and static configuration.
 * Pure TypeScript — no framework imports.
 */

import type { AppSettings } from './types';
import type { RubricDimension } from './types';
import type { BatchBandCode } from './enums';

// =============================================================================
// Default App Settings
// =============================================================================

export const DEFAULT_APP_SETTINGS: AppSettings = {
  consecutiveViolationThreshold: 4,
  lateThresholdMinutes: 5,
  approvedAbsenceCountsAsViolation: false,
  longAbsenceRequiresApproval: true,
  compulsoryPaymentAmountIndiaPaise: 250_000,   // INR 2,500
  compulsoryPaymentAmountAbroadPaise: 1_000_000, // INR 10,000
  aiWeeklyReportRequiresTeacherApproval: true,
  progressionRequiresTestPass: true,
  progressionRequiresRecordingAccepted: true,
  pitchCheckToleranceCents: 50,
  defaultTimezone: 'Asia/Kolkata',
  recordingRetentionDays: 365,
  paymentProofRetentionDays: 730,
  classWindowMorningStart: '05:00',
  classWindowMorningEnd: '06:30',
  classWindowEveningStart: '16:30',
  classWindowEveningEnd: '17:30',
  violationResetOnProperAttendance: true,
  absenceNoticeHoursBeforeClass: 6,
  bhajan: {
    defaultTime: '17:30',
    timezone: 'Asia/Kolkata',
  },
  notifications: {
    emailEnabled: true,
    inAppEnabled: true,
    riyazReminderTime: '06:00',
    pranayamaReminderTime: '05:30',
    classReminderMinutesBefore: 60,
    classStartingSoonMinutesBefore: 15,
  },
  devotionalCalendar: {
    attributionText: 'Event information referenced from Drik Panchang (drikpanchang.com)',
    showAttributionLink: true,
  },
  updatedAt: '',
  updatedBy: '',
};

// =============================================================================
// Default Assessment Rubric
// =============================================================================

export const DEFAULT_RUBRIC_DIMENSIONS: RubricDimension[] = [
  {
    key: 'shruti_pitch',
    label: 'Shruti / Pitch Accuracy',
    maxScore: 10,
    description: 'Accuracy of the notes sung relative to the intended swaras',
  },
  {
    key: 'tala_rhythm',
    label: 'Tala / Rhythm Stability',
    maxScore: 10,
    description: 'Consistency of rhythm and adherence to the taalam',
  },
  {
    key: 'pronunciation_diction',
    label: 'Pronunciation / Diction',
    maxScore: 10,
    description: 'Clarity of syllable pronunciation in the lyrics',
  },
  {
    key: 'memory_recall',
    label: 'Memory / Recall',
    maxScore: 10,
    description: 'Ability to recall swaras and lyrics without assistance',
  },
  {
    key: 'bhava_expression',
    label: 'Bhava / Devotional Expression',
    maxScore: 10,
    description: 'Emotional depth and devotional quality in rendering',
  },
  {
    key: 'practice_consistency',
    label: 'Practice Consistency',
    maxScore: 10,
    description: 'Evidence of regular practice since last assessment',
  },
  {
    key: 'overall_readiness',
    label: 'Overall Readiness',
    maxScore: 10,
    description: 'Teacher judgment on readiness to advance to next unit',
  },
];

// =============================================================================
// Ganamrutha Bodhini — Seed Lesson Structure
// =============================================================================

/**
 * Seed data for the Ganamrutha Bodhini syllabus.
 * This maps lesson numbers to their names, container status, and batch band.
 * The actual Firestore documents are created by the seed script.
 */
export const GANAMRUTHA_BODHINI_LESSONS = [
  { lessonNumber: 1, lessonName: 'Swaravali Varisaigal', isContainer: false, batchBandCode: 'A' as BatchBandCode, ragam: 'Maya Malava Gowla', taalam: 'Adhi Thalam (Melam 15)' },
  { lessonNumber: 2, lessonName: 'Jantai Varisaigal', isContainer: false, batchBandCode: 'A' as BatchBandCode, ragam: 'Maya Malava Gowla', taalam: 'Adhi Thalam' },
  { lessonNumber: 3, lessonName: 'Dhattu Varisaigal', isContainer: false, batchBandCode: 'B' as BatchBandCode, ragam: 'Maya Malava Gowla', taalam: 'Various Thalams' },
  { lessonNumber: 4, lessonName: 'Upper Sthayi Varisaigal', isContainer: false, batchBandCode: 'B' as BatchBandCode, ragam: 'Maya Malava Gowla', taalam: 'Various Thalams' },
  { lessonNumber: 5, lessonName: 'Geethams', isContainer: true, batchBandCode: 'C' as BatchBandCode, ragam: null, taalam: null },
];

/**
 * All 13 Geethams from Ganamrutha Bodhini (Lesson 8 in the book).
 * Mapped as teaching units inside our app's Lesson 5 (Geetham container).
 * Data extracted from the actual textbook PDF.
 */
export const INITIAL_GEETHAMS = [
  { unitNumber: 1, unitName: 'Geetham 1 — Sree Ganapathini', ragam: 'Malahari', taalam: 'Chathurasra Jathi Rupaka Thalam' },
  { unitNumber: 2, unitName: 'Geetham 2 — Kundasura Gouravani', ragam: 'Malahari', taalam: 'Chathurasra Jathi Rupaka Thalam' },
  { unitNumber: 3, unitName: 'Geetham 3 — Kereyaneera', ragam: 'Malahari', taalam: 'Thisra Jathi Triputa Thalam' },
  { unitNumber: 4, unitName: 'Geetham 4 — Padumanaabha', ragam: 'Malahari', taalam: 'Thisra Jathi Triputa Thalam' },
  { unitNumber: 5, unitName: 'Geetham 5 — Analekara', ragam: 'Suddha Saveri', taalam: 'Thisra Jathi Triputa Thalam' },
  { unitNumber: 6, unitName: 'Geetham 6 — Varaveenamrudupani', ragam: 'Mohana', taalam: 'Chathurasra Jathi Rupaka Thalam' },
  { unitNumber: 7, unitName: 'Geetham 7 — Kamalajadala', ragam: 'Kalyani', taalam: 'Thisra Jathi Triputa Thalam' },
  { unitNumber: 8, unitName: 'Geetham 8 — Janakasuthaku', ragam: 'Saveri', taalam: 'Chathurasra Jathi Rupaka Thalam' },
  { unitNumber: 9, unitName: 'Geetham 9 — Mandara Dhararey', ragam: 'Kamboji', taalam: 'Chathurasra Jathi Triputa Thalam (Adi)' },
  { unitNumber: 10, unitName: 'Geetham 10 — Raariveelaraa', ragam: 'Arabhi', taalam: 'Thisra Jathi Triputa Thalam' },
  { unitNumber: 11, unitName: 'Geetham 11 — Kamalasulochana', ragam: 'Ananda Bhairavi', taalam: 'Chathurasra Jathi Triputa Thalam (Adi)' },
  { unitNumber: 12, unitName: 'Geetham 12 — Meenakshi Jaya', ragam: 'Shree', taalam: 'Chathurasra Jathi Dhruva Thalam' },
  { unitNumber: 13, unitName: 'Geetham 13 — Shree Rama Chandraendra', ragam: 'Bhairavi', taalam: 'Chathurasra Jathi Dhruva Thalam' },
];

// =============================================================================
// Batch Band Definitions
// =============================================================================

export const BATCH_BAND_DEFINITIONS = [
  {
    code: 'A' as BatchBandCode,
    name: 'Batch A - Beginner Foundation',
    description: 'Lessons 1-2 (Swaravali, Jantai). Absolute beginners.',
    lessonRange: [1, 2],
  },
  {
    code: 'B' as BatchBandCode,
    name: 'Batch B - Developing Foundation',
    description: 'Lessons 3-4 (Dhattu, Upper Sthayi). Foundation consolidation.',
    lessonRange: [3, 4],
  },
  {
    code: 'C' as BatchBandCode,
    name: 'Batch C - Geetham Entry',
    description: 'Lesson 5, Geetham 1. First song unit.',
    lessonRange: [5, 5],
    teachingUnitScope: 'Geetham 1',
  },
  {
    code: 'D' as BatchBandCode,
    name: 'Batch D - Geetham Progress',
    description: 'Lesson 5, Geetham 2 and onwards. Progressive song expansion.',
    lessonRange: [5, 5],
    teachingUnitScope: 'Geetham 2+',
  },
];

// =============================================================================
// Regular Schedule
// =============================================================================

/**
 * Default class days (0=Sun, 1=Mon, ... 6=Sat).
 * Regular classes: Mon, Tue, Wed, Fri
 * Testing: Sat
 * No class: Thu, Sun
 */
export const DEFAULT_CLASS_DAYS = [1, 2, 3, 5] as const; // Mon, Tue, Wed, Fri
export const DEFAULT_TESTING_DAY = 6; // Saturday

// =============================================================================
// Firestore Collection Names
// =============================================================================

export const COLLECTIONS = {
  USERS: 'users',
  TEACHER_PROFILES: 'teacher_profiles',
  STUDENT_PROFILES: 'student_profiles',
  APP_SETTINGS: 'app_settings',
  SYLLABUS_BOOKS: 'syllabus_books',
  SYLLABUS_LESSONS: 'syllabus_lessons',
  TEACHING_UNITS: 'teaching_units',
  BATCH_BANDS: 'batch_bands',
  BATCH_ELIGIBILITY_RULES: 'batch_eligibility_rules',
  CLASS_SLOTS: 'class_slots',
  CLASS_INSTANCES: 'class_instances',
  STUDENT_CLASS_BOOKINGS: 'student_class_bookings',
  ATTENDANCE_RECORDS: 'attendance_records',
  ABSENCE_RECORDS: 'absence_records',
  LONG_ABSENCE_RECORDS: 'long_absence_records',
  PAYMENT_VIOLATION_COUNTERS: 'payment_violation_counters',
  MONTHLY_PAYMENT_STATUS: 'monthly_payment_status',
  PAYMENT_PROOF_UPLOADS: 'payment_proof_uploads',
  PAYMENT_AI_EXTRACTIONS: 'payment_ai_extractions',
  BHAJAN_SESSIONS: 'bhajan_sessions',
  LYRICS: 'lyrics',
  LYRIC_VERSIONS: 'lyric_versions',
  AI_LYRICS_DRAFTS: 'ai_lyrics_drafts',
  LESSON_PLANS: 'lesson_plans',
  LESSON_PLAN_ITEMS: 'lesson_plan_items',
  RESOURCES: 'resources',
  PRACTICE_RECORDINGS: 'practice_recordings',
  RECORDING_REVIEWS: 'recording_reviews',
  LESSON_ASSESSMENTS: 'lesson_assessments',
  ASSESSMENT_RUBRICS: 'assessment_rubrics',
  PROGRESSION_STATUS: 'progression_status',
  WEEKLY_REPORTS: 'weekly_reports',
  AI_FEEDBACK_DRAFTS: 'ai_feedback_drafts',
  PITCH_CHECK_RESULTS: 'pitch_check_results',
  DEVOTIONAL_CALENDAR_EVENTS: 'devotional_calendar_events',
  NOTIFICATIONS: 'notifications',
  AUDIT_LOGS: 'audit_logs',
  RIYAZ_CHECKINS: 'riyaz_checkins',
  TEACHER_AVAILABILITY_BLOCKS: 'teacher_availability_blocks',
} as const;

// =============================================================================
// Firebase Storage Paths
// =============================================================================

export const STORAGE_PATHS = {
  /** Practice recordings: /recordings/{studentId}/{teachingUnitId}/{weekOf}/{filename} */
  recording: (studentId: string, teachingUnitId: string, weekOf: string, filename: string) =>
    `recordings/${studentId}/${teachingUnitId}/${weekOf}/${filename}`,

  /** Payment proofs: /payment_proofs/{studentId}/{cycleMonth}/{filename} */
  paymentProof: (studentId: string, cycleMonth: string, filename: string) =>
    `payment_proofs/${studentId}/${cycleMonth}/${filename}`,

  /** Resources: /resources/{teacherId}/{filename} */
  resource: (teacherId: string, filename: string) =>
    `resources/${teacherId}/${filename}`,

  /** Lyrics attachments: /lyrics/{lyricsId}/{filename} */
  lyricsAttachment: (lyricsId: string, filename: string) =>
    `lyrics/${lyricsId}/${filename}`,
} as const;

// =============================================================================
// Recording Constraints
// =============================================================================

export const RECORDING_MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB
export const RECORDING_ALLOWED_MIME_TYPES = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg'];

// =============================================================================
// Payment Proof Constraints
// =============================================================================

export const PAYMENT_PROOF_MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
export const PAYMENT_PROOF_ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
];
