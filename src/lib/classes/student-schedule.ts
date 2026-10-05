/**
 * Per-student class schedule, stored on the student profile as `classSchedule`.
 *
 * Students in the same batch can have different days and lengths (e.g. one
 * student only on Wednesdays, another Mon–Thu for 30 minutes). When any
 * student in a batch has a schedule, the batch's classes are generated on the
 * union of those students' days, and each student's attendance only lists
 * their own days.
 */

export interface StudentSchedule {
  days: number[];            // 0 = Sunday … 6 = Saturday
  durationMinutes: number;   // default minutes taught per class
  startTime: string | null;  // 'HH:MM' IST; null = use the batch's usual time
}

export const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function parseSchedule(raw: unknown): StudentSchedule | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const days = Array.isArray(r.days)
    ? [...new Set(r.days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort()
    : [];
  if (days.length === 0) return null;
  const duration = Number(r.durationMinutes);
  const start = typeof r.startTime === 'string' && /^\d{2}:\d{2}$/.test(r.startTime) ? r.startTime : null;
  return { days, durationMinutes: duration > 0 ? Math.round(duration) : 60, startTime: start };
}

/** 'Mon–Thu · 30 min' / 'Wed · 60 min · 5:30 AM' */
export function describeSchedule(s: StudentSchedule): string {
  const consecutive = s.days.length > 2 && s.days.every((d, i) => i === 0 || d === s.days[i - 1] + 1);
  const days = consecutive
    ? `${DAY_LABELS[s.days[0]]}–${DAY_LABELS[s.days[s.days.length - 1]]}`
    : s.days.map((d) => DAY_LABELS[d]).join(', ');
  let time = '';
  if (s.startTime) {
    const [h, m] = s.startTime.split(':').map(Number);
    time = ` · ${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  }
  return `${days} · ${s.durationMinutes} min${time}`;
}

/** Add minutes to an 'HH:MM' time (same day, clamped to 23:59). */
export function addMinutesHHMM(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = Math.min(h * 60 + m + minutes, 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
