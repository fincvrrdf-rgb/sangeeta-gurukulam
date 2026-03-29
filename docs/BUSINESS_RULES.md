# Sangeeta Gurukulam — Business Rules

## 1. Student Grouping Rules
- Students are grouped by current lesson, sub-unit, mastery stage, and teacher readiness.
- Students are NEVER grouped by join date, enrollment month, or attendance count alone.
- Batch bands:
  - **A (Beginner Foundation):** Lessons 1-2
  - **B (Developing Foundation):** Lessons 3-4
  - **C (Geetham Entry):** Lesson 5, Geetham 1
  - **D (Geetham Progress):** Lesson 5, Geetham 2+
- A student belongs to the highest lesson or teaching unit they have been placed into or passed.

## 2. Mastery Stages (Ordered)
1. `introduced` — teacher introduced unit in class
2. `learning` — actively learning
3. `correction` — corrections being given
4. `practice_pending` — needs home practice
5. `recording_pending` — needs to submit recording
6. `test_due` — ready for Saturday testing
7. `passed` — teacher confirmed pass
8. `revision_needed` — needs revisit after prior pass

## 3. Progression Gate (All Must Be True)
- Current unit mastery stage is `passed`
- Practice recording submitted and accepted (if required by settings)
- Testing result is `pass` (if required by settings)
- Teacher explicitly confirmed readiness
- Teacher initiates the unlock action (never automatic)

## 4. Attendance Status Values
- `attended` — present and on time
- `late` — arrived after threshold (configurable, default 5 min)
- `absent` — did not attend, no prior notification
- `notified_absence` — student notified at least 6 hours before class
- `no_show` — booked but did not join
- `teacher_cancelled` — teacher cancelled the class
- `rescheduled` — class was rescheduled
- `long_approved_absence` — student has an active approved long absence

## 5. Payment Violation Rules

### What Counts as a Violation
- `late` — always a violation
- `absent` — always a violation
- `no_show` — always a violation
- `notified_absence` — depends on settings:
  - If approved AND `approvedAbsenceCountsAsViolation=false`: NOT a violation
  - Otherwise: violation

### What NEVER Counts as a Violation
- `teacher_cancelled` — NEVER a violation (hard rule)
- `long_approved_absence` — NEVER a violation (hard rule)
- `attended` — not a violation

### Consecutive Violation Counter
- Incremented on each violation
- Reset to 0 when student attends properly and on time (if `violationResetOnProperAttendance=true`)
- When counter reaches threshold (default: 4), compulsory payment is triggered

### Compulsory Payment
- **India students:** INR 2,500 (configurable)
- **Abroad students:** INR 10,000 (configurable)
- Payment is generally optional; becomes compulsory only when violation threshold is hit
- Payment amounts and thresholds are admin-configurable

### Payment States
- `not_required` — no obligations
- `optional` — student may pay voluntarily
- `compulsory` — violation threshold reached
- `proof_submitted` — student uploaded proof
- `pending_review` — teacher reviewing proof
- `paid` — teacher confirmed payment
- `waived` — admin/teacher waived requirement

## 6. Payment Proof Review
- Student uploads image/screenshot/PDF
- AI extracts fields (payer name, amount, date, transaction ID, bank context)
- AI extraction is ALWAYS draft — NEVER auto-approved
- Teacher/admin reviews extracted fields, can edit, then accepts or rejects
- Raw file + extraction + review status stored with audit trail
- Access restricted to: uploading student (write-only), assigned teacher, Super Admin

## 7. Long Absence Rules
- Requires: start date, end date, reason category, reason text, optional notes
- Categories: vacation, travel, illness, exams, family, other
- If `longAbsenceRequiresApproval=true`: teacher/admin must approve
- Active approved long absences:
  - Appear on dashboards and schedule views
  - Automatically mark affected attendance as `long_approved_absence`
  - NEVER count toward consecutive violation counter
  - NEVER trigger compulsory payment

## 8. Bhajan Rules
- Daily at 5:30 PM IST (configurable)
- Free, no payment logic applies
- Uses YouTube link / YouTube Live as primary join method
- States: `upcoming` → `live` → `replay_available` | `cancelled`
- Bhajan attendance tracked separately, never triggers payment logic
- Cancellation sends notification to all users

## 9. Booking Eligibility
- Students can only self-book into eligible batches matching their:
  - Current mastery stage and batch band
  - Teacher placement confirmation
  - Prior lesson pass state (where required)
- System prevents: double-booking, over-capacity, booking outside teacher availability
- Slots outside allowed class windows are rejected unless Super Admin overrides

## 10. Recording Consent
- Explicit consent required before any recording upload
- Consent timestamp stored on every recording document
- Minor students (`isMinor=true`) blocked until `guardianConsentGiven=true`
- Consent can be withdrawn from profile → triggers deletion workflow
- Recordings retained per `recordingRetentionDays` setting (default: 365)

## 11. Lyrics Content Rules
- No blind scraping or publishing of copyrighted lyrics
- AI-found lyrics/translations/transliterations enter `draft` state
- Teacher must review and approve before publishing
- Every published lyric requires a non-empty `sourceReference`
- Version history maintained on every save

## 12. AI Output Rules
- All AI-generated content (weekly reports, lyrics drafts, payment extractions, pitch checks) is ALWAYS in draft/review state
- Teacher/admin must explicitly approve before student visibility
- AI outputs are editable and overrideable
- Voice-care/wellness suggestions carry medical disclaimer

## 13. Grading and Testing
- Saturday is default testing day (morning or evening, configurable)
- Rubric dimensions: shruti/pitch accuracy, tala/rhythm stability, pronunciation/diction, memory/recall, bhava/devotional expression, practice consistency, overall readiness
- Results: pass, fail, retry, revise
- Progression depends on: lesson completion + practice submission + recording accepted + test outcome + teacher grading + readiness confirmation

## 14. Configurable Admin Settings
All of the following must be configurable in app_settings — never hardcoded:
- `consecutiveViolationThreshold` (default: 4)
- `lateThresholdMinutes` (default: 5)
- `approvedAbsenceCountsAsViolation` (default: false)
- `longAbsenceRequiresApproval` (default: true)
- `compulsoryPaymentAmountIndiaPaise` (default: 250000)
- `compulsoryPaymentAmountAbroadPaise` (default: 1000000)
- `aiWeeklyReportRequiresTeacherApproval` (default: true)
- `progressionRequiresTestPass` (default: true)
- `progressionRequiresRecordingAccepted` (default: true)
- `pitchCheckToleranceCents` (default: 50)
- `defaultTimezone` (default: Asia/Kolkata)
- `recordingRetentionDays` (default: 365)
- `paymentProofRetentionDays` (default: 730)
- `classWindowMorningStart` / `End` (default: 05:00 / 06:30)
- `classWindowEveningStart` / `End` (default: 16:30 / 17:30)
- `violationResetOnProperAttendance` (default: true)
- `bhajan.defaultTime` (default: 17:30)
- `bhajan.timezone` (default: Asia/Kolkata)
- Notification preferences and timing
- Devotional calendar attribution settings
