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
  viaLink: boolean;
  notes: string;
  recordInstanceId: string;
}

interface ClassJoins {
  key: string;
  instanceId: string;
  batch: string;
  date: string;
  start: string;
  end: string;
  cancelled: boolean;
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

  const info = student.status === null
    ? 'Not recorded'
    : student.joinedAt
      ? `Clicked Join at ${istTime(student.joinedAt)}${student.viaLink ? '' : ' · edited by you'}`
      : 'Marked by you';

  return (
    <li className="px-3 py-2 space-y-1">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="min-w-0 flex-1 basis-40">
          <p className="text-sm text-charcoal truncate">{student.name}</p>
          <p className={`text-xs ${student.status === null ? 'text-orange-600' : 'text-gray-400'}`}>{info}</p>
        </div>
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
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={0}
            max={600}
            inputMode="numeric"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            placeholder={String(classLengthMinutes(cls))}
            className="input text-xs py-1 px-2 w-16"
            aria-label={`Minutes taught to ${student.name}`}
          />
          <span className="text-xs text-gray-400">min</span>
        </div>
        <button
          onClick={save}
          disabled={!dirty || saving || (!status && !minutes)}
          className="text-xs font-semibold px-2.5 py-1 rounded-lg border border-teal-400 text-teal-700 hover:bg-teal-50 disabled:opacity-30 disabled:cursor-default"
        >
          {saving ? '…' : 'Save'}
        </button>
      </div>
      {err && <p className="text-xs text-red-600">{err}</p>}
    </li>
  );
}

function ClassCard({
  cls,
  apiFetch,
  onStudentSaved,
}: {
  cls: ClassJoins;
  apiFetch: ApiFetch;
  onStudentSaved: (classKey: string, updated: StudentAttendance) => void;
}) {
  const present = cls.students.filter((s) => s.status && PRESENT.has(s.status)).length;
  const unrecorded = cls.students.filter((s) => s.status === null).length;
  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`badge ${BATCH_COLORS[cls.batch] ?? 'badge-neutral'}`}>Batch {cls.batch}</span>
          <span className="text-sm font-semibold text-charcoal">{formatDay(cls.date)}</span>
          <span className="text-sm text-gray-500">{istTime(cls.start)} – {istTime(cls.end)}</span>
          {cls.cancelled && <span className="badge badge-error">Cancelled</span>}
        </div>
        {!cls.cancelled && (
          <span className="text-sm font-semibold text-charcoal">
            {present}
            <span className="text-gray-400 font-normal"> / {cls.students.length} present</span>
            {unrecorded > 0 && <span className="text-xs text-orange-600 font-normal"> · {unrecorded} not recorded</span>}
          </span>
        )}
      </div>

      {!cls.cancelled && cls.students.length > 0 && (
        <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
          {cls.students.map((s) => (
            <StudentRow
              key={`${s.studentId}|${s.status}|${s.durationMinutes}`}
              cls={cls}
              student={s}
              apiFetch={apiFetch}
              onSaved={(u) => onStudentSaved(cls.key, u)}
            />
          ))}
        </ul>
      )}
      {!cls.cancelled && cls.students.length === 0 && (
        <p className="text-xs text-gray-400">No students enrolled in this batch.</p>
      )}
    </div>
  );
}

export default function ClassesPage() {
  const { user, apiFetch } = useAuthContext();
  const [batchLinks, setBatchLinks] = useState<BatchLinkRow[]>([]);
  const [classes, setClasses] = useState<ClassJoins[]>([]);
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

  // Per-student totals for the selected period and batch
  const totals = new Map<string, { name: string; batch: string; present: number; minutes: number; untimed: number }>();
  for (const c of visible) {
    if (c.cancelled) continue;
    for (const s of c.students) {
      const t = totals.get(s.studentId) ?? { name: s.name, batch: c.batch, present: 0, minutes: 0, untimed: 0 };
      if (s.status && PRESENT.has(s.status)) {
        t.present++;
        if (s.durationMinutes != null) t.minutes += s.durationMinutes;
        else t.untimed++;
      }
      totals.set(s.studentId, t);
    }
  }
  const totalRows = [...totals.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name));
  const fmtMinutes = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60 ? `${m % 60}m` : ''}`.trim() : `${m}m`);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">
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
                  <a
                    href={b.meetLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-semibold text-teal-700 border border-teal-400 rounded-lg px-2.5 py-1 hover:bg-teal-50"
                  >
                    📹 Join
                  </a>
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
              Filled in automatically when a student clicks Join. Change anything and press Save; add minutes to record how long you taught each student.
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

        {/* Per-student totals */}
        {!loading && totalRows.length > 0 && (
          <div className="card p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 text-left border-b border-gray-100">
                  <th className="px-3 py-2 font-medium">Student</th>
                  <th className="px-3 py-2 font-medium">Batch</th>
                  <th className="px-3 py-2 font-medium text-right">Classes</th>
                  <th className="px-3 py-2 font-medium text-right">Time taught</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {totalRows.map(([id, t]) => (
                  <tr key={id}>
                    <td className="px-3 py-2 text-charcoal">{t.name}</td>
                    <td className="px-3 py-2 text-gray-500">{t.batch}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{t.present}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmtMinutes(t.minutes)}
                      {t.untimed > 0 && (
                        <span className="block text-[11px] text-gray-400">
                          {t.untimed} class{t.untimed !== 1 ? 'es' : ''} without minutes
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {loading &&
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card animate-pulse space-y-2">
              <div className="h-4 w-48 bg-gray-200 rounded" />
              <div className="h-3 w-32 bg-gray-100 rounded" />
            </div>
          ))}

        {!loading && visible.length === 0 && (
          <div className="card text-center py-10 text-sm text-gray-500">No classes in this period.</div>
        )}

        {!loading &&
          visible.map((c) => (
            <ClassCard key={c.key} cls={c} apiFetch={apiFetch} onStudentSaved={handleStudentSaved} />
          ))}
      </div>
    </div>
  );
}
