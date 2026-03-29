# Sangeeta Gurukulam — Product Requirements Document

## Product Name
**Sangeeta Gurukulam**

## Brand Feel
Traditional, devotional, calm, trustworthy, respectful, mobile-friendly, practical for real daily use.

## Purpose
A web app for managing Indian classical Carnatic devotional music classes. This is not a generic music-learning app. It supports real daily teaching operations including:

- Student management and academic progression
- Class scheduling with Google Meet integration
- Self-booking into eligible batch slots
- Attendance tracking (lateness, absence, long absence, teacher cancellation)
- Monthly lesson planning tied to syllabus
- Syllabus progression based on mastery (Ganamrutha Bodhini)
- In-app practice recording with consent
- Teacher-led grading and Saturday testing
- AI-assisted weekly reports and improvement advice
- Assistive pitch-check support
- Lyrics management with transliteration and translation
- Document and resource management
- Daily free bhajan session via YouTube
- Devotional calendar (festivals, vrats)
- Conditional payment rules engine
- AI-assisted payment proof extraction
- Admin-configurable settings for all policy thresholds

## Tech Stack
- Next.js 14 (App Router) + TypeScript (strict)
- Tailwind CSS
- Firebase Auth (Email/Password + Google OAuth)
- Cloud Firestore
- Firebase Storage
- Groq API (Llama 3.3-70B) for text AI
- Google Gemini 2.5 Flash for vision/multimodal AI
- Resend for transactional email
- Vercel for deployment
- Zod for validation

## Target Users

### Super Admin
Full system access. Manages all teachers, students, settings, syllabus, batches, payments, devotional calendar, and audit logs.

### Teacher
Scoped to assigned students. Manages classes, attendance, lesson planning, lyrics, recordings review, grading, weekly reports, bhajan sessions, and payment proof review.

### Student
Scoped to own data. Views eligible slots, self-books classes, joins class/bhajan, marks absence, uploads payment proof, accesses lyrics/resources, records practice, views feedback and weekly reports, does riyaz check-in.

### Guardian/Parent (Phase 2)
Future role for managing minor student accounts.

## Current Syllabus
Based on the book **Ganamrutha Bodhini**.

| Lesson | Name | Container? | Batch Band |
|--------|------|-----------|------------|
| 1 | Swaravali | No | A (Beginner Foundation) |
| 2 | Jantai | No | A (Beginner Foundation) |
| 3 | Dhattu | No | B (Developing Foundation) |
| 4 | Upper Sthayi | No | B (Developing Foundation) |
| 5 | Geetham | Yes | C (Entry) / D (Progress) |

Lesson 5 contains sub-units: Geetham 1, Geetham 2, Geetham 3, etc. Each Geetham is a separate teaching unit for planning, attendance, recording, grading, testing, and progression.

## Scheduling
- **Regular days:** Mon, Tue, Wed, Fri (morning + evening batches)
- **Testing day:** Saturday (morning or evening, configurable)
- **No class:** Thursday, Sunday (configurable)
- **Morning window:** 5:00 AM - 6:30 AM
- **Evening window:** 4:30 PM - 5:30 PM
- **Daily bhajan:** 5:30 PM (free, YouTube-based, separate from classes)

## Multi-Teacher Support
The system must support multiple teachers even if MVP operates with one. Every relevant entity stores teacher ownership/assignment. Teacher data is isolated — one teacher cannot access another's students unless Super Admin grants it.

## Non-Negotiable Rules
1. Mastery-based progression, never attendance-count-based
2. No reproduction of Ganamrutha Bodhini book pages
3. All AI outputs are drafts — never auto-approved or auto-published
4. Long approved absences never count as payment violations
5. Teacher-cancelled classes never count as violations
6. Student recordings require explicit consent with deletion capability
7. Payment proof access is strictly least-privilege
8. All critical actions logged to audit_logs
9. Teacher data isolation enforced at security rules and API levels
10. All policy thresholds configurable in admin settings, never hardcoded
