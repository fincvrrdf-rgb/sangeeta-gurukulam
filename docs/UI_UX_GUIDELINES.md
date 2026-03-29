# Sangeeta Gurukulam — UI/UX Guidelines

## Brand Identity
- **Feel:** Traditional, devotional, calm, trustworthy, respectful
- **Primary use:** Mobile (class time, bhajan time, on-the-go)
- **Secondary use:** Desktop/tablet (teacher planning, admin settings)

## Design Principles

### 1. Mobile-First
Every page must be designed for 375px width first. Desktop layouts are responsive extensions. The most critical flows (Join Class, Join Bhajan, Mark Absence, Upload Payment) must be one-tap accessible from the dashboard.

### 2. Quick-Access Dashboard
The student landing page uses large, icon-based action cards:

**Top priority (largest cards):**
- Join Class
- Join Bhajan

**Secondary cards:**
- Lyrics
- Attendance
- Mark Absence
- Upload Payment Proof
- Resources / Documents
- Riyaz Check-in
- Practice Recording / Submit Practice
- Weekly Report / Feedback

Cards are shown/hidden based on role and current state (e.g., "Join Class" only active when a class is live or starting soon).

### 3. Calm Color Palette
- **Primary:** Deep saffron / warm amber (devotional, traditional)
- **Secondary:** Deep blue-green / teal (trust, calm)
- **Background:** Warm off-white / cream
- **Text:** Dark charcoal (high readability)
- **Accent:** Gold (highlights, badges)
- **Error:** Muted red
- **Success:** Muted green

Avoid bright neon colors. Keep the palette warm and grounded.

### 4. Typography
- **Headings:** Serif or semi-serif (Playfair Display or similar) for devotional feel
- **Body:** Clean sans-serif (Inter, DM Sans) for readability
- **Lyrics display:** Larger body text with generous line height for reading during class
- **Font size toggle** on lyrics pages (critical for mobile reading during sessions)

### 5. Navigation

**Student Nav:**
- Bottom tab bar on mobile (Dashboard, Classes, Lyrics, Practice, More)
- Sidebar on desktop

**Teacher Nav:**
- Sidebar with sections: Dashboard, Students, Classes, Planning, Lyrics, Recordings, Assessments, Reports, Payment, Bhajan
- Collapsible on mobile

**Admin Nav:**
- Sidebar: Dashboard, Teachers, Students, Syllabus, Batches, Settings, Calendar, Audit Logs, Payment Rules, Notifications

### 6. Notification UI
- Bell icon in top nav with unread count badge
- Dropdown panel showing recent notifications
- Full notifications page with mark-as-read and filters
- Non-intrusive — no blocking modals for notifications

## Page-Specific Guidelines

### Landing Page (Public)
- App name and tagline prominently displayed
- "Join Bhajan" CTA always visible (bhajan is free and public)
- Brief description of Sangeeta Gurukulam
- Login / Register buttons

### Bhajan Page
- Large status card:
  - Upcoming: countdown timer to 5:30 PM
  - Live: YouTube embed with "Join" overlay
  - Replay: replay embed
  - Cancelled: reason text
- Today's bhajan lyrics below the player
- Devotional context card
- Past replays section

### Lyrics Viewer
- Tab-based: Original | Transliteration | Translation
- Font size toggle (S / M / L / XL)
- Clean, distraction-free reading layout
- Quick links: Today's Bhajan Lyrics, Today's Class Song, Practice for the Week

### Practice Recording Page
- Consent banner (first time or if consent not given)
- Current teaching unit pre-selected
- Large Record button (red circle, unmistakable)
- Waveform or time indicator while recording
- Playback controls after recording
- Re-record button
- Submit button (with confirmation)
- Progress bar during upload

### Teacher Grading Form
- Student name and current unit at top
- Rubric dimensions as labeled sliders or number inputs
- Auto-calculated total
- Pass / Fail / Retry / Revise radio buttons
- Text areas for comments, strengths, corrections
- "Ready for Next Lesson" checkbox

### Attendance Marking (Teacher)
- List of booked students for the class
- Status dropdown per student: Attended / Late / Absent / No-show / Notified Absence
- Notes field per student
- Bulk actions where useful
- Clear visual for long-absence students (greyed out, marked automatically)

## Accessibility
- All interactive elements must be keyboard-navigable
- Color contrast must meet WCAG 2.1 AA minimum
- Form labels must be associated with inputs
- Error messages must be clear and specific
- Loading states must use skeleton screens (not spinners that block content)
- Empty states must be informative (not just blank)

## Disclaimers
- Voice-care and AI suggestions display: "This is educational/wellness guidance. Not medical advice."
- Pitch-check results display: "Assistive tool only. Teacher judgment is final."
- AI-generated content in weekly reports: "AI-assisted summary. Reviewed by teacher."
- Devotional calendar: "Event dates referenced from [source]. Please verify with current panchang."
