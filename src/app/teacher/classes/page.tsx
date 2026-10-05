/**
 * Classes — /teacher/classes
 *
 * Top: each batch's ONE stable Meet link (copy / join).
 * Below: attendance per class (/api/attendance/joins), filled in when a
 * student clicks their batch's Join link and editable inline — status and
 * minutes taught per student — plus per-student totals for the period.
 */

'use client';

import { useEffect, useState } from 'react';
import { useAuthContext } from '@/components/layout/AuthProvider';
import { DAY_LABELS, describeSchedule, type StudentSchedule } from '@/lib/classes/student-schedule';

interface BatchLinkRow {
  id: string;
  code: string;
  meetLink: string | null;
}

interface StudentAttendance {
  studentId: string;
  name: string;
  status: string | null;
  joinedAt: string | null;
  lateByMinutes: number;
  durationMinutes: number | null;
  scheduledMinutes: number | null;
  start: string | null;
  end: string | null;
  viaLink: boolean;
  notes: string;
  recordInstanceId: string;
}

interface StudentInfo {
  studentId: string;
  name: string;
  batch: string;
  schedule: StudentSchedule | null;
}

interface ClassJoins {
  key: string;
  instanceId: string;
  batch: string;
  date: string;
  start: string;
  end: string;
  cancelled: boolean;
  teacherJoinedAt: string | null;
  enrolled: number;
  students: StudentAttendance[];
}

const BATCH_COLORS: Record<string, string> = {
  A: 'bg-amber-100 text-amber-800',
  B: 'bg-orange-100 text-orange-800',
  C: 'bg-teal-100 text-teal-800',
  D: 'bg-purple-100 text-purple-800',
};

const DEFAULT_SCHEDULE = [
  { batchBandCode: 'A', dayOfWeek: [1, 3], start: '05:30', end: '06:30' },
  { batchBandCode: 'B', dayOfWeek: [1, 3], start: '16:30', end: '17:30' },
  { batchBandCode: 'C', dayOfWeek: [2, 4], start: '05:30', end: '06:30' },
  { batchBandCode: 'D', dayOfWeek: [2, 4], start: '16:30', end: '17:30' },
] as const;

function istTime(iso: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-IN', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata',
  });
}

function formatDay(date: string): string {
  const fmt = (offset: number) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(Date.now() + offset * 86_400_000));
  if (date === fmt(0)) return 'Today';
  if (date === fmt(-1)) return 'Yesterday';
  return new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
}

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'attended', label: 'Attended' },
  { value: 'late', label: 'Late' },
  { value: 'absent', label: 'Absent' },
  { value: 'notified_absence', label: 'Excused' },
];

const PRESENT = new Set(['attended', 'late']);

/** "3 min after you" / "2 min before you" / "same time as you" */
function relativeToTeacher(studentAt: string, teacherAt: string): string {
  const diff = Math.round((new Date(studentAt).getTime() - new Date(teacherAt).getTime()) / 60000);
  if (diff === 0) return 'same time as you';
  return diff > 0 ? `${diff} min after you` : `${-diff} min before you`;
}

function classLengthMinutes(c: ClassJoins): number {
  const ms = new Date(c.end).getTime() - new Date(c.start).getTime();
  return ms > 0 ? Math.round(ms / 60000) : 60;
}

type ApiFetch = (url: string, init?: RequestInit) => Promise<Response>;

function StudentRow({
  cls,
  student,
  apiFetch,
  onSaved,
}: {
  cls: ClassJoins;
  student: StudentAttendance;
  apiFetch: ApiFetch;
  onSaved: (updated: StudentAttendance) => void;
}) {
  const [status, setStatus] = useState(student.status ?? '');
  const [minutes, setMinutes] = useState(student.durationMinutes != null ? String(student.durationMinutes) : '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const dirty =
    status !== (student.status ?? '') ||
    minutes !== (student.durationMinutes != null ? String(student.durationMinutes) : '');

  async function save() {
    // Entering minutes without a status means they attended
    const finalStatus = status || (minutes ? 'attended' : '');
    if (!finalStatus) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await apiFetch('/api/attendance/mark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: student.studentId,
          classInstanceId: student.recordInstanceId,
          status: finalStatus,
          lateByMinutes: finalStatus === 'late' ? student.lateByMinutes : 0,
          durationMinutes: minutes === '' ? null : Math.max(0, Math.round(Number(minutes))),
          notes: student.notes,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'Could not save');
      setStatus(finalStatus);
      onSaved({
        ...student,
        status: finalStatus,
        durationMinutes: minutes === '' ? null : Math.max(0, Math.round(Number(minutes))),
        viaLink: false,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr className="align-middle">
      <td className="px-3 py-2 whitespace-nowrap">
        <p className="text-sm text-charcoal">{formatDay(cls.date)}</p>
        <p className="text-xs text-gray-400">{istTime(student.start ?? cls.start)} – {istTime(student.end ?? cls.end)}</p>
      </td>
      <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-600 tabular-nums">
        {cls.teacherJoinedAt ? istTime(cls.teacherJoinedAt) : <span className="text-gray-300">—</span>}
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        {student.joinedAt ? (
          <>
            <p className="text-sm text-gray-600 tabular-nums">{istTime(student.joinedAt)}</p>
            {cls.teacherJoinedAt && (
              <p className="text-[11px] text-gray-400">{relativeToTeacher(student.joinedAt, cls.teacherJoinedAt)}</p>
            )}
          </>
        ) : student.status === null ? (
          <span className="text-xs text-orange-600">Not recorded</span>
        ) : (
          <span className="text-xs text-gray-400">Marked by you</span>
        )}
      </td>
      <td className="px-3 py-2">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="input text-xs py-1 px-2 w-28"
          aria-label={`Attendance for ${student.name}`}
        >
          <option value="">—</option>
          {status && !STATUS_OPTIONS.some((o) => o.value === status) && (
            <option value={status}>{status.replace(/_/g, ' ')}</option>
          )}
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={0}
            max={600}
            inputMode="numeric"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            placeholder={String(student.scheduledMinutes ?? classLengthMinutes(cls))}
            className="input text-xs py-1 px-2 w-16"
            aria-label={`Minutes taught to ${student.name}`}
          />
          <span className="text-xs text-gray-400">min</span>
        </div>
      </td>
      <td className="px-3 py-2 text-right">
        <button
          onClick={save}
          disabled={!dirty || saving || (!status && !minutes)}
          className="text-xs font-semibold px-2.5 py-1 rounded-lg border border-teal-400 text-teal-700 hover:bg-teal-50 disabled:opacity-30 disabled:cursor-default"
        >
          {saving ? '…' : 'Save'}
        </button>
        {err && <p className="text-[11px] text-red-600 mt-0.5">{err}</p>}
      </td>
    </tr>
  );
}

const fmtMinutes = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60 ? `${m % 60}m` : ''}`.trim() : `${m}m`);

interface StudentSheet {
  studentId: string;
  name: string;
  batch: string;
  schedule: StudentSchedule | null;
  rows: { cls: ClassJoins; student: StudentAttendance }[];
}

function StudentTable({
  sheet,
  apiFetch,
  onStudentSaved,
  onScheduleSaved,
}: {
  sheet: StudentSheet;
  apiFetch: ApiFetch;
  onStudentSaved: (classKey: string, updated: StudentAttendance) => void;
  onScheduleSaved: () => Promise<void>;
}) {
  const present = sheet.rows.filter((r) => r.student.status && PRESENT.has(r.student.status));
  const minutes = present.reduce((sum, r) => sum + (r.student.durationMinutes ?? r.student.scheduledMinutes ?? 0), 0);
  const untimed = present.filter((r) => r.student.durationMinutes == null && r.student.scheduledMinutes == null).length;
  const [editing, setEditing] = useState(false);
  const unrecorded = sheet.rows.filter((r) => r.student.status === null).length;

  return (
    <div className="card p-0 overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap border-b border-gray-100">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-charcoal">{sheet.name}</h3>
            <span className={`badge ${BATCH_COLORS[sheet.batch] ?? 'badge-neutral'}`}>Batch {sheet.batch}</span>
          </div>
          <p className="text-xs text-gray-500">
            {sheet.schedule ? describeSchedule(sheet.schedule) : 'Batch schedule'}{' '}
            <button onClick={() => setEditing((v) => !v)} className="text-teal-600 hover:text-teal-800 font-medium ml-1">
              {editing ? 'Close' : 'Edit schedule'}
            </button>
          </p>
        </div>
        <p className="text-sm text-charcoal">
          <span className="font-semibold">{present.length}</span>
          <span className="text-gray-400"> / {sheet.rows.length} classes · </span>
          <span className="font-semibold">{fmtMinutes(minutes)}</span>
          <span className="text-gray-400"> taught</span>
          {untimed > 0 && <span className="block text-[11px] text-gray-400 text-right">{untimed} without minutes</span>}
          {unrecorded > 0 && <span className="block text-[11px] text-orange-600 text-right">{unrecorded} not recorded</span>}
        </p>
      </div>
      {editing && (
        <ScheduleEditor
          studentId={sheet.studentId}
          initial={sheet.schedule}
          apiFetch={apiFetch}
          onSaved={async () => {
            setEditing(false);
            await onScheduleSaved();
          }}
        />
      )}
      {sheet.rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-gray-400 text-center">No classes in this period.</p>
      ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 text-left bg-gray-50">
              <th className="px-3 py-2 font-medium">Class</th>
              <th className="px-3 py-2 font-medium">You joined</th>
              <th className="px-3 py-2 font-medium">Student joined</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Minutes</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sheet.rows.map(({ cls, student }) => (
              <StudentRow
                key={`${cls.key}|${student.status}|${student.durationMinutes}`}
                cls={cls}
                student={student}
                apiFetch={apiFetch}
                onSaved={(u) => onStudentSaved(cls.key, u)}
              />
            ))}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}

function ScheduleEditor({
  studentId,
  initial,
  apiFetch,
  onSaved,
}: {
  studentId: string;
  initial: StudentSchedule | null;
  apiFetch: ApiFetch;
  onSaved: () => Promise<void>;
}) {
  const [days, setDays] = useState<number[]>(initial?.days ?? []);
  const [minutes, setMinutes] = useState(String(initial?.durationMinutes ?? 60));
  const [startTime, setStartTime] = useState(initial?.startTime ?? '');
  // Per-day start times; empty = use the usual start time
  const [dayTimes, setDayTimes] = useState<Record<string, string>>(initial?.dayTimes ?? {});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const toggle = (d: number) => setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      const res = await apiFetch(`/api/students/${studentId}/schedule`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          days,
          durationMinutes: Math.max(5, Math.round(Number(minutes) || 60)),
          startTime: startTime || null,
          dayTimes: Object.fromEntries(
            Object.entries(dayTimes).filter(([d, t]) => t && t !== startTime && days.includes(Number(d))),
          ),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'Could not save schedule');
      // Create the upcoming classes for the new days right away
      await apiFetch('/api/classes/instances/auto-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ daysAhead: 14 }),
      });
      await onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save schedule');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 space-y-3">
      <div>
        <p className="text-xs font-medium text-gray-600 mb-1.5">Class days</p>
        <div className="flex flex-wrap gap-1.5">
          {[1, 2, 3, 4, 5, 6, 0].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => toggle(d)}
              aria-pressed={days.includes(d)}
              className={`text-xs px-2.5 py-1 rounded-lg border ${
                days.includes(d) ? 'bg-teal-600 text-white border-teal-600' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-100'
              }`}
            >
              {DAY_LABELS[d]}
            </button>
          ))}
        </div>
      </div>
      {days.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-600 mb-1.5">Different time on some days? (leave blank to use the usual time)</p>
          <div className="flex flex-wrap gap-3">
            {days.map((d) => (
              <label key={d} className="text-xs text-gray-600 flex items-center gap-1.5">
                {DAY_LABELS[d]}
                <input
                  type="time"
                  value={dayTimes[String(d)] ?? ''}
                  onChange={(e) => setDayTimes((prev) => ({ ...prev, [String(d)]: e.target.value }))}
                  className="input text-sm py-1 px-2 w-28"
                  aria-label={`Start time on ${DAY_LABELS[d]}`}
                />
              </label>
            ))}
          </div>
        </div>
      )}
      <div className="flex items-end gap-3 flex-wrap">
        <label className="text-xs text-gray-600">
          Minutes per class
          <input
            type="number"
            min={5}
            max={300}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            className="input text-sm py-1 px-2 w-20 mt-1 block"
          />
        </label>
        <label className="text-xs text-gray-600">
          Usual start time
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="input text-sm py-1 px-2 w-32 mt-1 block"
          />
        </label>
        <button onClick={save} disabled={saving} className="btn-primary text-xs px-3 py-1.5">
          {saving ? 'Saving…' : days.length ? 'Save schedule' : 'Use batch schedule'}
        </button>
      </div>
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  );
}

export default function ClassesPage() {
  const { user, apiFetch } = useAuthContext();
  const [batchLinks, setBatchLinks] = useState<BatchLinkRow[]>([]);
  const [classes, setClasses] = useState<ClassJoins[]>([]);
  const [studentList, setStudentList] = useState<StudentInfo[]>([]);
  const [hasSlots, setHasSlots] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [settingUp, setSettingUp] = useState(false);
  const [batchFilter, setBatchFilter] = useState<string>('all');
  const [days, setDays] = useState(14);

  function load(period = days) {
    return Promise.all([
      apiFetch('/api/admin/batches').then((r) => r.json()).catch(() => ({ batches: [] })),
      apiFetch(`/api/attendance/joins?days=${period}`).then((r) => r.json()),
      apiFetch('/api/classes/slots').then((r) => r.json()).catch(() => ({ slots: [] })),
    ])
      .then(([batchData, joinData, slotData]) => {
        const bands: Record<string, unknown>[] = batchData.batches ?? [];
        setBatchLinks(
          bands
            .filter((b) => b.isActive !== false)
            .map((b) => ({ id: b.id as string, code: (b.code as string) ?? '', meetLink: (b.meetLink as string) ?? null }))
            .sort((a, b) => a.code.localeCompare(b.code)),
        );
        if (joinData.error) throw new Error(joinData.error);
        setClasses(joinData.classes ?? []);
        setStudentList(joinData.students ?? []);
        setHasSlots((slotData.slots ?? []).length > 0 || (joinData.classes ?? []).length > 0);
      })
      .catch((err) => setError(err.message ?? 'Failed to load classes.'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    load(days);
  }, [user, days]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleStudentSaved(classKey: string, updated: StudentAttendance) {
    setClasses((prev) =>
      prev.map((c) =>
        c.key !== classKey
          ? c
          : { ...c, students: c.students.map((s) => (s.studentId === updated.studentId ? updated : s)) },
      ),
    );
  }

  /** Open Meet, then record the teacher's join time on today's class for this batch. */
  async function teacherJoin(code: string, link: string) {
    window.open(link, '_blank', 'noopener,noreferrer');
    try {
      const res = await apiFetch('/api/classes/teacher-join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchCode: code }),
      });
      const json = await res.json();
      if (json.recorded && json.teacherJoinedAt) {
        setClasses((prev) =>
          prev.map((c) =>
            c.batch === code && c.date === new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
              ? { ...c, teacherJoinedAt: c.teacherJoinedAt ?? json.teacherJoinedAt }
              : c,
          ),
        );
      }
    } catch { /* non-blocking */ }
  }

  async function copyLink(code: string, link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch { /* clipboard unavailable */ }
  }

  async function handleSetupSchedule() {
    if (!confirm('Create the default 4-batch schedule (A/B Mon–Wed, C/D Tue–Thu)?')) return;
    setSettingUp(true);
    try {
      for (const batch of DEFAULT_SCHEDULE) {
        for (const day of batch.dayOfWeek) {
          await apiFetch('/api/classes/slots', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              batchBandCode: batch.batchBandCode,
              dayOfWeek: day,
              startTimeIST: batch.start,
              endTimeIST: batch.end,
              slotType: 'regular',
            }),
          });
        }
      }
      await apiFetch('/api/classes/instances/auto-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ daysAhead: 14 }),
      });
      await load();
    } catch {
      setError('Some of the schedule could not be created. Please try again.');
    } finally {
      setSettingUp(false);
    }
  }

  const visible = classes.filter((c) => batchFilter === 'all' || c.batch === batchFilter);
  const batchesWithClasses = [...new Set(classes.map((c) => c.batch))].sort();

  // One sheet per student: their classes, newest first (classes already sorted)
  const sheetMap = new Map<string, StudentSheet>();
  for (const st of studentList) {
    if (batchFilter !== 'all' && st.batch !== batchFilter) continue;
    sheetMap.set(st.studentId, { studentId: st.studentId, name: st.name, batch: st.batch, schedule: st.schedule, rows: [] });
  }
  for (const c of visible) {
    if (c.cancelled) continue;
    for (const st of c.students) {
      const sheet = sheetMap.get(st.studentId) ?? { studentId: st.studentId, name: st.name, batch: c.batch, schedule: null, rows: [] };
      sheet.rows.push({ cls: c, student: st });
      sheetMap.set(st.studentId, sheet);
    }
  }
  const sheets = [...sheetMap.values()].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-5">
      <h1 className="font-heading text-2xl font-bold text-charcoal">Classes</h1>

      {error && <div className="card border-red-300 bg-red-50 text-red-800 text-sm">{error}</div>}

      {/* One stable link per batch */}
      {batchLinks.length > 0 && (
        <div className="card p-0 divide-y divide-gray-100">
          <div className="px-4 py-2.5">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Batch Class Links</h2>
          </div>
          {batchLinks.map((b) => (
            <div key={b.id} className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className={`badge flex-shrink-0 ${BATCH_COLORS[b.code] ?? 'badge-neutral'}`}>Batch {b.code}</span>
                {b.meetLink ? (
                  <span className="text-sm text-gray-600 truncate">{b.meetLink.replace('https://', '')}</span>
                ) : (
                  <span className="text-sm text-gray-400 italic">No link set</span>
                )}
              </div>
              {b.meetLink && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => copyLink(b.code, b.meetLink!)}
                    className="text-xs text-gray-500 border border-gray-300 rounded-lg px-2.5 py-1 hover:bg-gray-50"
                  >
                    {copiedCode === b.code ? '✓ Copied' : 'Copy'}
                  </button>
                  <button
                    onClick={() => teacherJoin(b.code, b.meetLink!)}
                    className="text-xs font-semibold text-teal-700 border border-teal-400 rounded-lg px-2.5 py-1 hover:bg-teal-50"
                  >
                    📹 Join
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* First-time setup */}
      {!loading && !hasSlots && (
        <div className="card border-saffron-300 bg-saffron-50 space-y-3">
          <p className="font-semibold text-charcoal">No weekly schedule yet</p>
          <div className="text-sm space-y-1 text-gray-700">
            <p><strong>Batch A</strong> — Mon, Wed · 5:30–6:30 AM</p>
            <p><strong>Batch B</strong> — Mon, Wed · 4:30–5:30 PM</p>
            <p><strong>Batch C</strong> — Tue, Thu · 5:30–6:30 AM</p>
            <p><strong>Batch D</strong> — Tue, Thu · 4:30–5:30 PM</p>
          </div>
          <button onClick={handleSetupSchedule} disabled={settingUp} className="btn-primary text-sm">
            {settingUp ? 'Setting up…' : 'Create Default Schedule'}
          </button>
        </div>
      )}

      {/* Attendance — from Join clicks, editable */}
      <div className="space-y-3">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-heading text-lg font-semibold text-charcoal">Attendance</h2>
            <p className="text-xs text-gray-500">
              One table per student. Filled in automatically when you and the student click Join; change anything and press Save, and add the minutes you taught.
            </p>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="input text-xs py-1 px-2 w-auto"
              aria-label="Period"
            >
              <option value={14}>Last 14 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
            {batchesWithClasses.length > 1 &&
              ['all', ...batchesWithClasses].map((b) => (
                <button
                  key={b}
                  onClick={() => setBatchFilter(b)}
                  className={`text-xs px-2.5 py-1 rounded-lg border ${
                    batchFilter === b ? 'bg-charcoal text-white border-charcoal' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {b === 'all' ? 'All' : b}
                </button>
              ))}
          </div>
        </div>

        {loading &&
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card animate-pulse space-y-2">
              <div className="h-4 w-48 bg-gray-200 rounded" />
              <div className="h-3 w-32 bg-gray-100 rounded" />
            </div>
          ))}

        {!loading && sheets.length === 0 && (
          <div className="card text-center py-10 text-sm text-gray-500">No classes in this period.</div>
        )}

        {!loading &&
          sheets.map((sheet) => (
            <StudentTable
              key={sheet.studentId}
              sheet={sheet}
              apiFetch={apiFetch}
              onStudentSaved={handleStudentSaved}
              onScheduleSaved={() => load(days)}
            />
          ))}
      </div>
    </div>
  );
}
