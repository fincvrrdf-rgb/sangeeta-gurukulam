# Sangeeta Gurukulam — Technical Architecture

## Stack Overview

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14, App Router, TypeScript (strict) |
| Styling | Tailwind CSS |
| Auth | Firebase Auth (Email/Password + Google OAuth) |
| Database | Cloud Firestore |
| File Storage | Firebase Storage |
| AI (text) | Groq API — Llama 3.3-70B Versatile |
| AI (vision) | Google Gemini 2.5 Flash |
| Email | Resend (transactional) |
| Validation | Zod |
| Deployment | Vercel |
| Audio | MediaRecorder API (browser-native) |

## Project Structure

```
sangeeta-gurukulam/
├── docs/                     # Product, business rules, architecture docs
├── firestore.rules           # Firestore security rules
├── storage.rules             # Firebase Storage security rules
├── middleware.ts              # Next.js middleware (role-based routing)
├── .env.local.example        # Environment variable contract
├── vercel.json               # Vercel deployment + cron config
├── src/
│   ├── domain/               # Pure TypeScript — NO framework imports
│   │   ├── types.ts          # All Firestore document interfaces
│   │   ├── enums.ts          # MasteryStage, AttendanceStatus, etc.
│   │   └── constants.ts      # Default settings, rubric dimensions, seed data
│   ├── lib/                  # Infrastructure wrappers (thin, swappable)
│   │   ├── firebase/
│   │   │   ├── client.ts     # Firebase client SDK init (browser)
│   │   │   ├── admin.ts      # Firebase Admin SDK init (server-only)
│   │   │   └── firestore.ts  # Typed Firestore helpers
│   │   ├── ai/
│   │   │   ├── groq.ts       # Groq client wrapper (server-only)
│   │   │   └── gemini.ts     # Gemini client wrapper (server-only)
│   │   ├── email/
│   │   │   └── resend.ts     # Resend wrapper (server-only)
│   │   └── calendar/
│   │       └── google.ts     # Google Calendar API wrapper (server-only)
│   ├── services/             # Business logic (server-side, called from API routes)
│   │   ├── attendance/
│   │   │   ├── violation.ts  # computeAttendanceViolation (pure function)
│   │   │   └── counter.ts    # updateViolationCounter (Firestore transaction)
│   │   ├── payment/
│   │   │   ├── trigger.ts    # triggerCompulsoryPayment
│   │   │   └── status.ts     # Payment status management
│   │   ├── progression/
│   │   │   ├── gates.ts      # checkProgressionGates
│   │   │   └── placement.ts  # Student placement and advancement
│   │   ├── notifications/
│   │   │   ├── create.ts     # createNotification
│   │   │   └── email.ts      # Send email notifications
│   │   ├── reports/
│   │   │   └── generate.ts   # AI weekly report generation
│   │   ├── lyrics/
│   │   │   └── versions.ts   # Lyrics versioning
│   │   └── audit/
│   │       └── log.ts        # writeAuditLog
│   ├── app/                  # Next.js App Router
│   │   ├── layout.tsx        # Root layout
│   │   ├── (public)/         # No auth required
│   │   │   ├── page.tsx      # Landing page
│   │   │   ├── bhajan/       # Public bhajan page
│   │   │   ├── privacy/      # Privacy policy
│   │   │   └── terms/        # Terms of service
│   │   ├── (auth)/           # Auth pages (login, register, forgot-password)
│   │   ├── student/          # Student-only pages (RoleGuard: student)
│   │   ├── teacher/          # Teacher-only pages (RoleGuard: teacher)
│   │   ├── admin/            # Admin-only pages (RoleGuard: super_admin)
│   │   └── api/              # API route handlers (server-side)
│   │       ├── auth/
│   │       ├── classes/
│   │       ├── attendance/
│   │       ├── absence/
│   │       ├── payment/
│   │       ├── bhajan/
│   │       ├── lyrics/
│   │       ├── recordings/
│   │       ├── assessments/
│   │       ├── planning/
│   │       ├── reports/
│   │       ├── admin/
│   │       └── cron/
│   └── components/           # Shared React components
│       ├── layout/           # AppShell, Sidebar, MobileNav
│       ├── ui/               # Buttons, cards, forms, modals
│       ├── bhajan/           # BhajanStatusCard, YouTubeEmbed
│       ├── lyrics/           # LyricsViewer (tabs)
│       ├── recording/        # InAppRecorder, ConsentGate
│       ├── grading/          # RubricForm, ProgressionGateStatus
│       ├── timezone/         # TimezoneDisplay
│       └── notifications/    # NotificationBell
```

## Architecture Principles

### 1. Separation of Concerns
- **domain/** — Pure TypeScript types and constants. No imports from Next.js, Firebase, or React.
- **lib/** — Thin infrastructure wrappers. Swappable without changing business logic.
- **services/** — Business logic. Called only from API routes. No direct Firestore access from UI.
- **app/api/** — HTTP boundary. Auth validation, Zod input validation, calls services, returns JSON.
- **app/[role]/** — UI pages. Call API routes via fetch. Real-time listeners only for specific use cases.

### 2. Server-Side Business Logic
All business logic (violation computation, payment triggers, progression gates, AI calls) runs in Next.js API routes — never on the client. This ensures:
- Consistent rule enforcement regardless of client state
- Secrets (API keys, admin SDK) never exposed to browser
- Audit logging at the point of mutation

### 3. Auth Pattern
```
Browser request → middleware.ts (checks Firebase ID token cookie, redirects by role)
API route → requireAuth(request, allowedRoles[]) → returns { uid, role } or 401/403
Firestore → security rules as last line of defense (backup to API layer)
```

### 4. Data Flow
```
UI Component → fetch('/api/...', { body }) → API Route Handler
  → Zod validation on request body
  → requireAuth(request, roles)
  → Service function (business logic)
  → Firestore read/write (via Admin SDK)
  → writeAuditLog (for critical actions)
  → createNotification (if applicable)
  → Return JSON response
```

### 5. AI Integration
- **Groq (Llama 3.3-70B):** Text tasks — weekly reports, lyrics transliteration/translation/summarization, pitch analysis interpretation
- **Gemini 2.5 Flash:** Vision tasks — payment proof image/PDF extraction
- All AI calls are server-side only
- All AI outputs saved to draft/review collections (never auto-published)
- Rate limiting on AI endpoints to prevent abuse

### 6. Firebase Security Model
- Firestore security rules enforce least-privilege per role
- Firebase Storage rules restrict recordings and payment proofs to owners + assigned teacher + admin
- Firebase Auth custom claims store `role` and are verified server-side
- No client-side Firestore writes for business-critical data

### 7. Timezone Strategy
- All Firestore timestamps stored as UTC
- Class slot templates store local time string + IANA timezone
- Frontend converts UTC to user's local timezone for display
- Server-side lateness calculation uses UTC comparison
- India (Asia/Kolkata, UTC+5:30) does not observe DST — stable year-round

## Environment Variables

### Client-Side (NEXT_PUBLIC_)
```
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
```

### Server-Side Only
```
FIREBASE_ADMIN_PROJECT_ID
FIREBASE_ADMIN_CLIENT_EMAIL
FIREBASE_ADMIN_PRIVATE_KEY

GROQ_API_KEY
GEMINI_API_KEY
RESEND_API_KEY

GOOGLE_CALENDAR_CLIENT_ID
GOOGLE_CALENDAR_CLIENT_SECRET

CRON_SECRET          # Shared secret for Vercel Cron job authorization
```

## Firestore Collections

Top-level collections (all document IDs are auto-generated unless noted):

| Collection | Keyed By | Description |
|-----------|---------|-------------|
| `users` | Firebase UID | Auth profile, role, consent flags |
| `teacher_profiles` | userId | Teacher-specific data, calendar connection |
| `student_profiles` | userId | Student data, billing region, progression state |
| `app_settings` | `global` (single doc) | All configurable policy thresholds |
| `syllabus_books` | auto | Book metadata (Ganamrutha Bodhini) |
| `syllabus_lessons` | auto | Lessons within a book |
| `teaching_units` | auto | Sub-units within container lessons |
| `batch_bands` | auto | Academic grouping bands (A/B/C/D) |
| `batch_eligibility_rules` | auto | Eligibility criteria per band |
| `class_slots` | auto | Recurring slot templates |
| `class_instances` | auto | Actual scheduled class events |
| `student_class_bookings` | auto | Student bookings for class instances |
| `attendance_records` | auto | Per-student per-class attendance |
| `absence_records` | auto | Standard absence submissions |
| `long_absence_records` | auto | Extended absence periods |
| `payment_violation_counters` | studentId | Consecutive violation tracking |
| `monthly_payment_status` | auto | Per-student per-cycle payment state |
| `payment_proof_uploads` | auto | Uploaded payment proof files |
| `payment_ai_extractions` | auto | AI-extracted fields from proofs |
| `bhajan_sessions` | auto | Daily bhajan session data |
| `lyrics` | auto | Song lyrics with metadata |
| `lyric_versions` | auto | Immutable version history |
| `ai_lyrics_drafts` | auto | AI-generated lyrics assistance |
| `lesson_plans` | auto | Monthly teacher plans |
| `lesson_plan_items` | auto | Individual planned class items |
| `resources` | auto | Uploaded documents and files |
| `practice_recordings` | auto | Student practice audio |
| `recording_reviews` | auto | Teacher reviews of recordings |
| `lesson_assessments` | auto | Grading records |
| `assessment_rubrics` | auto | Rubric templates |
| `progression_status` | auto | Per-student per-unit mastery tracking |
| `weekly_reports` | auto | AI-assisted weekly reports |
| `ai_feedback_drafts` | auto | Raw AI report outputs |
| `pitch_check_results` | auto | Assistive pitch analysis |
| `devotional_calendar_events` | auto | Festival/vrat entries |
| `notifications` | auto | In-app + email notifications |
| `audit_logs` | auto | Immutable action log |
| `riyaz_checkins` | auto | Daily practice self-reports |
| `teacher_availability_blocks` | auto | Teacher unavailability periods |

## Deployment
- **Platform:** Vercel
- **Root directory:** `/` (standalone repo)
- **Framework:** Next.js (auto-detected)
- **Build command:** `npm run build`
- **Cron jobs:** Defined in `vercel.json` for scheduled tasks (class reminders, bhajan status, planning checks, report generation)
