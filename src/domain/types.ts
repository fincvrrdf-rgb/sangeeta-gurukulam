/**
 * domain/types.ts
 *
 * All Firestore document interfaces. Pure TypeScript — no framework imports.
 * Each interface maps 1:1 to a Firestore document shape.
 * Timestamps are stored as ISO strings in the domain layer;
 * Firestore adapters convert to/from Firestore Timestamp objects.
 */

import type {
  UserRole,
  MasteryStage,
  AttendanceStatus,
  ClassInstanceStatus,
  ClassSlotType,
  DayOfWeek,
  BatchBandCode,
  TeachingUnitType,
  BookingStatus,
  LongAbsenceReasonCategory,
  LongAbsenceStatus,
  BillingRegion,
  PaymentStatus,
  PaymentProofStatus,
  PaymentAiExtractionStatus,
  BhajanSessionStatus,
  LyricsVerificationStatus,
  AiLyricsDraftType,
  AiLyricsDraftStatus,
  LessonPlanStatus,
  RecordingStatus,
  RecordingReviewStatus,
  AssessmentType,
  AssessmentResult,
  PitchCheckResult,
  WeeklyReportStatus,
  AiFeedbackDraftStatus,
  DevotionalEventType,
  NotificationType,
  NotificationChannel,
  AvailabilityBlockReason,
  BookLicenseStatus,
  ResourceVisibility,
  AuditAction,
} from './enums';

// =============================================================================
// Users & Profiles
// =============================================================================

/** Top-level user document. Keyed by Firebase UID. */
export interface User {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  isActive: boolean;
  consentRecordings: boolean;
  consentRecordingsTimestamp: string | null;
  consentNotifications: boolean;
  privacyPolicyAcceptedAt: string | null;
  termsAcceptedAt: string | null;
  timezone: string; // IANA e.g. 'Asia/Kolkata'
  locale: string;   // e.g. 'en-IN'
  createdAt: string;
  updatedAt: string;
}

/** Teacher-specific profile. Keyed by userId. */
export interface TeacherProfile {
  userId: string;
  fullName: string;
  phone: string;
  bio: string;
  defaultTimezone: string;
  googleCalendarConnected: boolean;
  googleCalendarEmail: string | null;
  // OAuth refresh token stored server-side only — never in client-readable Firestore.
  // This field stores a reference ID for the server-side secrets store.
  googleOAuthTokenRef: string | null;
  assignedBatchBandIds: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Student-specific profile. Keyed by userId. */
export interface StudentProfile {
  userId: string;
  fullName: string;
  phone: string;
  guardianName: string | null;
  guardianPhone: string | null;
  guardianEmail: string | null;
  isMinor: boolean;
  guardianConsentGiven: boolean;
  guardianConsentTimestamp: string | null;
  primaryTeacherId: string;
  enrollmentDate: string;
  countryCode: string; // ISO 3166-1 alpha-2
  billingRegion: BillingRegion;
  currentLessonId: string;
  currentTeachingUnitId: string;
  currentMasteryStage: MasteryStage;
  currentBatchBandId: string;
  consecutiveViolationCount: number;
  isPaymentCompulsoryThisCycle: boolean;
  paymentCompulsoryTriggeredAt: string | null;
  paymentCompulsoryReason: string | null;
  longAbsenceActive: boolean;
  onboardingComplete: boolean;
  placementNotes: string;
  createdAt: string;
  updatedAt: string;
}

// =============================================================================
// App Settings
// =============================================================================

/** Single global settings document (id: 'global'). */
export interface AppSettings {
  consecutiveViolationThreshold: number;
  lateThresholdMinutes: number;
  approvedAbsenceCountsAsViolation: boolean;
  longAbsenceRequiresApproval: boolean;
  compulsoryPaymentAmountIndiaPaise: number;
  compulsoryPaymentAmountAbroadPaise: number;
  aiWeeklyReportRequiresTeacherApproval: boolean;
  progressionRequiresTestPass: boolean;
  progressionRequiresRecordingAccepted: boolean;
  pitchCheckToleranceCents: number;
  defaultTimezone: string;
  recordingRetentionDays: number;
  paymentProofRetentionDays: number;
  classWindowMorningStart: string; // 'HH:MM'
  classWindowMorningEnd: string;
  classWindowEveningStart: string;
  classWindowEveningEnd: string;
  violationResetOnProperAttendance: boolean;
  absenceNoticeHoursBeforeClass: number;
  bhajan: {
    defaultTime: string; // 'HH:MM'
    timezone: string;
  };
  notifications: {
    emailEnabled: boolean;
    inAppEnabled: boolean;
    riyazReminderTime: string;
    pranayamaReminderTime: string;
    classReminderMinutesBefore: number;
    classStartingSoonMinutesBefore: number;
  };
  devotionalCalendar: {
    attributionText: string;
    showAttributionLink: boolean;
  };
  updatedAt: string;
  updatedBy: string;
}

// =============================================================================
// Syllabus
// =============================================================================

export interface SyllabusBook {
  id: string;
  title: string;
  authorName: string;
  publisherName: string;
  edition: string;
  teacherSummary: string; // teacher-authored overview
  isActive: boolean;
  licenseStatus: BookLicenseStatus;
  copyrightNotes: string; // internal compliance note
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
}

export interface SyllabusLesson {
  id: string;
  bookId: string;
  lessonNumber: number;
  lessonName: string;       // e.g. 'Swaravali'
  description: string;      // teacher-authored
  isContainer: boolean;     // true for Lesson 5 (Geetham container)
  order: number;
  batchBandCode: BatchBandCode;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface TeachingUnit {
  id: string;
  lessonId: string;
  bookId: string;
  unitType: TeachingUnitType;
  unitName: string;           // e.g. 'Geetham 1'
  unitNumber: number;
  description: string;        // teacher-authored
  ragam: string | null;
  taalam: string | null;
  composer: string | null;
  estimatedClassCount: number;
  lyricsId: string | null;
  order: number;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// =============================================================================
// Batches & Eligibility
// =============================================================================

export interface BatchBand {
  id: string;
  code: BatchBandCode;
  name: string;              // e.g. 'Batch A - Beginner Foundation'
  description: string;
  lessonIdFrom: string;
  lessonIdTo: string;
  teachingUnitScopeNote: string | null;
  assignedTeacherId: string;
  isActive: boolean;
  maxCapacityPerSlot: number;
  createdAt: string;
  updatedAt: string;
}

export interface BatchEligibilityRule {
  id: string;
  batchBandId: string;
  requiredMasteryStages: MasteryStage[];
  requiredLessonPassedId: string | null;
  requiredTeachingUnitPassedId: string | null;
  requiresTeacherPlacement: boolean;
  createdAt: string;
  updatedAt: string;
}

// =============================================================================
// Scheduling
// =============================================================================

export interface ClassSlot {
  id: string;
  teacherId: string;
  batchBandId: string;
  dayOfWeek: DayOfWeek;
  startTimeLocal: string;     // 'HH:MM' in teacher's timezone
  endTimeLocal: string;
  timezone: string;
  slotType: ClassSlotType;
  recurrenceRule: string;     // RRULE string
  maxCapacity: number;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClassInstance {
  id: string;
  slotId: string;
  teacherId: string;
  batchBandId: string;
  scheduledStartTime: string;  // UTC ISO string
  scheduledEndTime: string;
  timezone: string;
  status: ClassInstanceStatus;
  cancellationReason: string | null;
  rescheduleTargetInstanceId: string | null;
  googleMeetLink: string | null;
  googleCalendarEventId: string | null;
  lessonPlanItemId: string | null;
  teachingUnitId: string | null;
  notifiedCancellation: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StudentClassBooking {
  id: string;
  studentId: string;
  classInstanceId: string;
  bookedAt: string;
  status: BookingStatus;
  headphonesConfirmed: boolean;
  cancelledAt: string | null;
  cancellationReason: string | null;
}

// =============================================================================
// Attendance & Absence
// =============================================================================

export interface AttendanceRecord {
  id: string;
  studentId: string;
  classInstanceId: string;
  teacherId: string;
  status: AttendanceStatus;
  markedAt: string;
  markedBy: string;
  lateByMinutes: number;
  isViolation: boolean;
  violationReason: string | null;
  countedInConsecutiveViolations: boolean;
  notes: string;
  createdAt: string;
}

export interface AbsenceRecord {
  id: string;
  studentId: string;
  classInstanceId: string;
  submittedAt: string;
  reason: string;
  hoursBeforeClass: number;
  isApproved: boolean;
  approvedBy: string | null;
  approvedAt: string | null;
  countAsViolation: boolean;
  createdAt: string;
}

export interface LongAbsenceRecord {
  id: string;
  studentId: string;
  startDate: string;
  endDate: string;
  reason: string;
  reasonCategory: LongAbsenceReasonCategory;
  notes: string;
  status: LongAbsenceStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  teacherNotified: boolean;
  createdAt: string;
  updatedAt: string;
}

// =============================================================================
// Payment
// =============================================================================

export interface PaymentViolationCounter {
  studentId: string;
  currentConsecutiveCount: number;
  violationHistory: ViolationHistoryEntry[];
  lastViolationAt: string | null;
  lastResetAt: string | null;
  lastResetReason: string | null;
  updatedAt: string;
}

export interface ViolationHistoryEntry {
  classInstanceId: string;
  date: string;
  reason: string;
  counted: boolean;
}

export interface MonthlyPaymentStatus {
  id: string;
  studentId: string;
  cycleMonth: string;         // 'YYYY-MM'
  billingRegion: BillingRegion;
  isCompulsory: boolean;
  compulsoryAmountPaise: number;
  compulsoryTriggeredAt: string | null;
  compulsoryTriggerReason: string | null;
  status: PaymentStatus;
  waivedBy: string | null;
  waivedReason: string | null;
  proofUploadId: string | null;
  auditTrail: PaymentAuditEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface PaymentAuditEntry {
  action: string;
  actorId: string;
  timestamp: string;
  notes: string;
}

export interface PaymentProofUpload {
  id: string;
  studentId: string;
  cycleMonth: string;
  uploadedAt: string;
  storageRef: string;           // Firebase Storage path (restricted)
  mimeType: string;
  fileSizeBytes: number;
  status: PaymentProofStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  aiExtractionId: string | null;
  deletedAt: string | null;
  deletedBy: string | null;
}

export interface PaymentAiExtraction {
  id: string;
  proofUploadId: string;
  extractedPayerName: string | null;
  extractedAmountPaise: number | null;
  extractedDate: string | null;
  extractedTransactionId: string | null;
  extractedBankContext: string | null;
  confidenceScore: number;
  rawModelOutput: string;
  status: PaymentAiExtractionStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  editorOverrides: Record<string, unknown>;
  createdAt: string;
}

// =============================================================================
// Bhajan
// =============================================================================

export interface BhajanSession {
  id: string;
  sessionDate: string;
  title: string;
  announcement: string;
  youtubeUrl: string | null;
  youtubeReplayUrl: string | null;
  status: BhajanSessionStatus;
  cancellationReason: string | null;
  lyricsIds: string[];
  devotionalContext: string;
  notes: string;
  managedBy: string;
  createdAt: string;
  updatedAt: string;
}

// =============================================================================
// Lyrics
// =============================================================================

export interface LyricsTranslation {
  text: string;
  translatedBy: string;
  source: string;
}

export interface LyricsAttachment {
  storageRef: string;
  fileName: string;
  mimeType: string;
}

export interface Lyrics {
  id: string;
  title: string;
  composer: string | null;
  deity: string | null;
  devotionalCategory: string | null;
  ragam: string | null;
  taalam: string | null;
  originalLanguage: string;
  sourceText: string;
  transliteration: string;
  translations: Record<string, LyricsTranslation>;
  notes: string;
  meaning: string;
  sourceReference: string;
  sourceLink: string | null;
  attachedFiles: LyricsAttachment[];
  verificationStatus: LyricsVerificationStatus;
  publishedAt: string | null;
  publishedBy: string | null;
  verifiedBy: string | null;
  linkedLessonIds: string[];
  linkedTeachingUnitIds: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface LyricVersion {
  id: string;
  lyricsId: string;
  versionNumber: number;
  changedBy: string;
  changedAt: string;
  snapshotSourceText: string;
  snapshotTransliteration: string;
  snapshotTranslations: Record<string, LyricsTranslation>;
  changeReason: string;
}

export interface AiLyricsDraft {
  id: string;
  lyricsId: string | null;
  draftType: AiLyricsDraftType;
  inputQuery: string;
  targetLanguage: string | null;
  rawAiOutput: string;
  status: AiLyricsDraftStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

// =============================================================================
// Lesson Planning
// =============================================================================

export interface LessonPlan {
  id: string;
  teacherId: string;
  month: string;              // 'YYYY-MM'
  batchBandId: string;
  status: LessonPlanStatus;
  confirmedAt: string | null;
  confirmedBy: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface LessonPlanItem {
  id: string;
  lessonPlanId: string;
  classInstanceId: string | null;
  scheduledDate: string;
  lessonId: string;
  teachingUnitId: string;
  topic: string;
  intendedSong: string;
  goals: string;
  lessonNotes: string;
  requiredResourceIds: string[];
  lyricsId: string | null;
  lyricsUploaded: boolean;
  lyricsVerified: boolean;
  teacherConfirmed: boolean;
  confirmedAt: string | null;
  order: number;
  createdAt: string;
  updatedAt: string;
}

// =============================================================================
// Resources
// =============================================================================

export interface Resource {
  id: string;
  title: string;
  description: string;
  storageRef: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  category: string;
  linkedLessonId: string | null;
  linkedTeachingUnitId: string | null;
  teacherId: string;
  visibility: ResourceVisibility;
  visibleToBatchBandIds: string[];
  createdAt: string;
  updatedAt: string;
}

// =============================================================================
// Practice Recordings
// =============================================================================

export interface PracticeRecording {
  id: string;
  studentId: string;
  teacherId: string;
  lessonId: string;
  teachingUnitId: string;
  classInstanceId: string | null;
  weekOf: string;             // 'YYYY-WW'
  storageRef: string;         // Firebase Storage path (restricted)
  mimeType: string;
  durationSeconds: number;
  status: RecordingStatus;
  submittedAt: string | null;
  consentConfirmedAt: string;
  studentNote: string;
  createdAt: string;
  updatedAt: string;
}

export interface RecordingReview {
  id: string;
  recordingId: string;
  reviewedBy: string;
  reviewedAt: string;
  status: RecordingReviewStatus;
  feedback: string;
  pitchCheckResultId: string | null;
  unlocksProgressionGate: boolean;
  createdAt: string;
}

// =============================================================================
// Assessments & Grading
// =============================================================================

export interface RubricDimension {
  key: string;
  label: string;
  maxScore: number;
  description: string;
}

export interface AssessmentRubric {
  id: string;
  name: string;
  dimensions: RubricDimension[];
  applicableUnitTypes: TeachingUnitType[];
  isDefault: boolean;
  createdBy: string;
  createdAt: string;
}

export interface LessonAssessment {
  id: string;
  studentId: string;
  teacherId: string;
  lessonId: string;
  teachingUnitId: string;
  classInstanceId: string | null;
  assessmentDate: string;
  assessmentType: AssessmentType;
  rubricId: string;
  rubricScores: Record<string, number>; // dimension key → score
  totalScore: number;
  maxScore: number;
  result: AssessmentResult;
  readinessForNext: boolean;
  teacherComments: string;
  strengths: string;
  correctionsNeeded: string;
  createdAt: string;
  updatedAt: string;
}

// =============================================================================
// Progression
// =============================================================================

export interface ProgressionStatus {
  id: string;
  studentId: string;
  lessonId: string;
  teachingUnitId: string;
  masteryStage: MasteryStage;
  startedAt: string;
  passedAt: string | null;
  lastAssessmentId: string | null;
  lastRecordingId: string | null;
  teacherPlacedAt: string | null;
  placedBy: string | null;
  isCurrentUnit: boolean;
  notes: string;
  updatedAt: string;
}

// =============================================================================
// Weekly Reports
// =============================================================================

export interface WeeklyReportLessonEntry {
  lessonId: string;
  teachingUnitId: string;
  summary: string;
}

export interface WeeklyReport {
  id: string;
  studentId: string;
  teacherId: string;
  weekOf: string;             // 'YYYY-WW'
  lessonsCovered: WeeklyReportLessonEntry[];
  practiceSongs: string[];
  lyricsToRevise: string[];
  weakAreas: string[];
  strengths: string[];
  readinessForNext: boolean;
  requiredRecordingBeforeNextClass: string;
  teacherRemarks: string;
  aiSummary: string;
  aiImprovementAdvice: string;
  aiDraftId: string | null;
  status: WeeklyReportStatus;
  publishedAt: string | null;
  publishedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AiFeedbackDraft {
  id: string;
  reportId: string;
  studentId: string;
  weekOf: string;
  generatedAt: string;
  rawOutput: string;
  parsedSummary: string;
  parsedImprovementAdvice: string;
  parsedWeakAreas: string[];
  parsedStrengths: string[];
  isAssistiveOnly: boolean;   // always true
  status: AiFeedbackDraftStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  editorChanges: Record<string, unknown>;
  createdAt: string;
}

// =============================================================================
// Pitch Check
// =============================================================================

export interface PitchCheckResultDoc {
  id: string;
  recordingId: string;
  studentId: string;
  teachingUnitId: string;
  analyzedAt: string;
  targetSwaras: string[];
  analysisResult: PitchCheckResult;
  confidenceScore: number;
  detailsJson: string;
  audioQualityIssue: boolean;
  audioQualityNote: string | null;
  isAssistiveOnly: boolean;   // always true
  createdAt: string;
}

// =============================================================================
// Devotional Calendar
// =============================================================================

export interface DevotionalCalendarEvent {
  id: string;
  eventDate: string;
  title: string;
  eventType: DevotionalEventType;
  description: string;
  significance: string;
  sourceReference: string;
  sourceUrl: string | null;
  relatedBhajanNote: string | null;
  suggestedLyricsIds: string[];
  isRecurring: boolean;
  recurrenceRule: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// =============================================================================
// Notifications
// =============================================================================

export interface Notification {
  id: string;
  recipientId: string;
  recipientRole: UserRole;
  type: NotificationType;
  title: string;
  body: string;
  referenceType: string | null;
  referenceId: string | null;
  isRead: boolean;
  readAt: string | null;
  channel: NotificationChannel;
  emailSentAt: string | null;
  createdAt: string;
}

// =============================================================================
// Audit Logs
// =============================================================================

export interface AuditLog {
  id: string;
  actorId: string;
  actorRole: UserRole;
  action: AuditAction;
  entityType: string;
  entityId: string;
  previousStateJson: string | null;
  newStateJson: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  timestamp: string;
  notes: string | null;
}

// =============================================================================
// Riyaz Check-in
// =============================================================================

export interface RiyazCheckin {
  id: string;
  studentId: string;
  checkinDate: string;        // 'YYYY-MM-DD'
  teachingUnitId: string | null;
  durationMinutes: number;
  notes: string;
  createdAt: string;
}

// =============================================================================
// Teacher Availability
// =============================================================================

export interface TeacherAvailabilityBlock {
  id: string;
  teacherId: string;
  startTime: string;
  endTime: string;
  reason: string;
  reasonCategory: AvailabilityBlockReason;
  affectedClassInstanceIds: string[];
  notificationSent: boolean;
  createdAt: string;
  updatedAt: string;
}
