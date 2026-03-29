# Sangeeta Gurukulam — Implementation Plan

## Overview
Full MVP implementation in 7 phases (A through G), dependency-safe order.

## Phase A — Repository and Docs
- [x] Create repository and docs
- [x] docs/PRD.md
- [x] docs/BUSINESS_RULES.md
- [x] docs/TECH_ARCHITECTURE.md
- [x] docs/UI_UX_GUIDELINES.md
- [x] docs/IMPLEMENTATION_PLAN.md
- [ ] Define folder structure (package.json, tsconfig, configs)
- [ ] Define environment variable contract (.env.local.example)
- [ ] Define shared types and domain models (src/domain/)

## Phase B — Core Backend / Domain
- [ ] App settings (default values, Firestore structure)
- [ ] Syllabus: books, lessons, teaching units
- [ ] Users, roles, teacher profiles, student profiles
- [ ] Batch bands and eligibility rules
- [ ] Class slots and class instances
- [ ] Attendance, absence, long absence
- [ ] Payment rules, violation counters, payment status
- [ ] Bhajan sessions
- [ ] Lyrics and lyric versions
- [ ] Lesson plans and plan items
- [ ] Resources
- [ ] Practice recordings and reviews
- [ ] Assessments, rubrics, progression status
- [ ] Weekly reports and AI feedback drafts
- [ ] Devotional calendar events
- [ ] Notifications
- [ ] Audit logs

## Phase C — Firebase and Security
- [ ] Firebase client SDK config
- [ ] Firebase Admin SDK config
- [ ] Auth wiring (custom claims, session management)
- [ ] Firestore security rules
- [ ] Storage security rules
- [ ] API route auth middleware (requireAuth)
- [ ] Zod validation schemas for all API routes

## Phase D — Student-Facing UI
- [ ] Landing page (quick-access cards)
- [ ] Login / Register / Forgot Password
- [ ] Student dashboard
- [ ] Join Class (Google Meet link display)
- [ ] Join Bhajan (YouTube embed)
- [ ] Mark Absence (standard)
- [ ] Long Absence entry
- [ ] Upload Payment Proof
- [ ] Lyrics viewer (original/transliteration/translation tabs)
- [ ] Resources page
- [ ] Riyaz Check-in
- [ ] Practice Recording submission (in-app recorder)
- [ ] Weekly Report view
- [ ] Attendance history
- [ ] Payment status view
- [ ] Notifications page
- [ ] Profile and consent management

## Phase E — Teacher / Admin UI
- [ ] Teacher dashboard (today's classes, pending reviews)
- [ ] Student management (list, detail, progression)
- [ ] Class management (slots, instances)
- [ ] Attendance marking
- [ ] Lesson planning (monthly view, items, lyrics readiness)
- [ ] Lyrics management (create, AI assist, verify, publish)
- [ ] Payment proof review (with AI extraction display)
- [ ] Recording review queue
- [ ] Grading / testing day workflow
- [ ] Progression approval
- [ ] Weekly report review and publish
- [ ] Bhajan session management
- [ ] Teacher availability / cancellation
- [ ] Admin: settings page
- [ ] Admin: syllabus management
- [ ] Admin: batch management
- [ ] Admin: teacher management
- [ ] Admin: devotional calendar management
- [ ] Admin: audit logs viewer
- [ ] Admin: notification broadcast

## Phase F — Integrations
- [ ] Google Calendar + Meet (OAuth, event creation, link generation)
- [ ] YouTube bhajan link flow
- [ ] AI payment proof extraction (Gemini vision)
- [ ] AI lyrics assistance (Groq: transliterate, translate, summarize)
- [ ] AI weekly report generation (Groq)
- [ ] Assistive pitch-check pipeline (Groq)
- [ ] Email notifications (Resend)

## Phase G — Testing and Hardening
- [ ] Unit tests for business logic (violation, progression, payment)
- [ ] Integration tests for API routes
- [ ] Permission and role-based access tests
- [ ] Validation tests (Zod schemas)
- [ ] Edge case handling
- [ ] Deployment notes for Vercel

## Dependencies Between Phases

```
A → B (domain types must exist before services)
B → C (services need Firebase and auth wired)
C → D (UI needs auth and API routes working)
C → E (teacher/admin UI needs same)
D + E → F (integrations connect to existing routes and UI)
F → G (tests cover the full integrated system)
```

Within each phase, files are generated in dependency-safe order:
- Types before services
- Services before API routes
- API routes before UI pages
- Shared components before pages that use them

## Firebase Project
- **Project ID:** sangeetagurukulam-b4ccb
- **Auth Domain:** sangeetagurukulam-b4ccb.firebaseapp.com
- **Storage Bucket:** sangeetagurukulam-b4ccb.firebasestorage.app

## GitHub Repository
- **URL:** https://github.com/fincvrrdf-rgb/sangeeta-gurukulam
- **Branch:** main

## Required Before Running
1. Firebase Console: Enable Authentication (Email/Password + Google)
2. Firebase Console: Create Firestore database (test mode initially)
3. Firebase Console: Enable Storage (test mode initially)
4. Firebase Console: Generate service account private key
5. Set all environment variables in Vercel or .env.local
6. Run `npm run seed` to populate syllabus and default settings
