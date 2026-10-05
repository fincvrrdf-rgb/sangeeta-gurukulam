/**
 * Per-student class schedule, stored on the student profile as `classSchedule`.
 *
 * Students in the same batch can have different days, times and lengths
 * (e.g. one student Wednesdays 5:00–6:00, another Mon–Thu 30 min at 5:00 but
 * 6:00 on Wednesdays). When any student in a batch has a schedule, the
 * batch's classes are generated on the union of their days, spanning from the
 * earliest student's start to the latest student's end. Each student's
 * lateness and attendance rows use their own start time.
 */

export interface StudentSchedule {
  days: number[];                    // 0 = Sunday … 6 = Saturday
  durationMinutes: number;           // minutes per class
  startTime: string | null;          // default 'HH:MM' IST; null = batch's usual time
  dayTimes: Record<string, string>;  // per-weekday start overrides, e.g. { '3': '06:00' }
}

export const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const HHMM = /^\d{2}:\d{2}$/;

export function parseSchedule(raw: unknown): StudentSchedule | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const days = Array.isArray(r.days)
    ? [...new Set(r.days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort()
    : [];
  if (days.length === 0) return null;
  const duration = Number(r.durationMinutes);
  const start = typeof r.startTime === 'string' && HHMM.test(r.startTime) ? r.startTime : null;
  const dayTimes: Record<string, string> = {};
  if (r.dayTimes && typeof r.dayTimes === 'object') {
    for (const [k, v] of Object.entries(r.dayTimes as Record<string, unknown>)) {
      if (days.includes(Number(k)) && typeof v === 'string' && HHMM.test(v) && v !== start) dayTimes[k] = v;
    }
  }
  return { days, durationMinutes: duration > 0 ? Math.round(duration) : 60, startTime: start, dayTimes };
}

/** The student's start time on a weekday, or null to use the batch's time. */
export function startFor(s: StudentSchedule, dow: number): string | null {
  return s.dayTimes[String(dow)] ?? s.startTime;
}

export function formatHHMM(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

function dayList(days: number[]): string {
  const consecutive = days.length > 2 && days.every((d, i) => i === 0 || d === days[i - 1] + 1);
  return consecutive
    ? `${DAY_LABELS[days[0]]}–${DAY_LABELS[days[days.length - 1]]}`
    : days.map((d) => DAY_LABELS[d]).join(', ');
}

/** 'Mon–Thu · 30 min · 5:00 AM (Wed 6:00 AM)' */
export function describeSchedule(s: StudentSchedule): string {
  let text = `${dayList(s.days)} · ${s.durationMinutes} min`;
  if (s.startTime) text += ` · ${formatHHMM(s.startTime)}`;
  const overrides = Object.entries(s.dayTimes).sort(([a], [b]) => Number(a) - Number(b));
  if (overrides.length) {
    text += ` (${overrides.map(([d, t]) => `${DAY_LABELS[Number(d)]} ${formatHHMM(t)}`).join(', ')})`;
  }
  return text;
}

/** Add minutes to an 'HH:MM' time (same day, clamped to 23:59). */
export function addMinutesHHMM(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = Math.min(h * 60 + m + minutes, 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
