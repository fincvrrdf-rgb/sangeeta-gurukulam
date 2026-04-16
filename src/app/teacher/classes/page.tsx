/**
 * Manage Classes — /teacher/classes
 *
 * Simple view: upcoming classes grouped by day.
 * Click "Edit time" on any class to change its timing inline.
 * Auto-Schedule generates instances from the recurring schedule.
 */

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuthContext } from '@/components/layout/AuthProvider';

type InstanceStatus = 'scheduled' | 'live' | 'completed' | 'cancelled';
type BatchBandCode = 'A' | 'B' | 'C' | 'D';

interface ClassInstance {
  id: string;
  date: string;           // YYYY-MM-DD
  startTime: string;      // "5:30 AM"
  endTime: string;        // "6:30 AM"
  startISO: string;       // full ISO for sending to API
  endISO: string;
  batchBand: BatchBandCode;
  status: InstanceStatus;
  meetLink?: string;
  enrolledCount?: number;
}

interface ClassSlot {
  id: string;
}

function istDateOffset(days: number): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  });
  return fmt.format(new Date(Date.now() + days * 86400000));
}

function todayIST(): string { return istDateOffset(0); }
function in14DaysIST(): string { return istDateOffset(14); }

function formatDay(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
}

function toHHMM(isoOrTime: string): string {
  // Extracts HH:MM from either a full ISO or a "HH:MM" time string
  if (isoOrTime.includes('T')) return isoOrTime.slice(11, 16);
  if (isoOrTime.length >= 5) return isoOrTime.slice(0, 5);
  return isoOrTime;
}

function displayTime(isoOrTime: string): string {
  const t = toHHMM(isoOrTime);
  const [h, m] = t.split(':').map(Number);
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

// Build an ISO datetime string by combining YYYY-MM-DD date with HH:MM time (IST)
function buildISO(date: string, hhmm: string): string {
  return `${date}T${hhmm}:00+05:30`;
}

function normalizeInstance(inst: Record<string, unknown>): ClassInstance {
  let date = (inst.date as string) ?? '';
  let startISO = (inst.scheduledStartTime as string) ?? '';
  let endISO = (inst.scheduledEndTime as string) ?? '';

  if (!date && startISO) date = startISO.slice(0, 10);

  return {
    id: inst.id as string,
    date,
    startTime: startISO ? displayTime(startISO) : ((inst.startTime as string) ?? ''),
    endTime: endISO ? displayTime(endISO) : ((inst.endTime as string) ?? ''),
    startISO,
    endISO,
    batchBand: ((inst.batchBand as string) ?? '') as BatchBandCode,
    status: (inst.status as InstanceStatus) ?? 'scheduled',
    meetLink: (inst.meetLink as string) ?? (inst.googleMeetLink as string) ?? undefined,
    enrolledCount: (inst.enrolledCount as number) ?? undefined,
  };
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

export default function ManageClassesPage() {
  const { user, apiFetch } = useAuthContext();
  const [instances, setInstances] = useState<ClassInstance[]>([]);
  const [slots, setSlots] = useState<ClassSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // Inline time edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [savingTime, setSavingTime] = useState(false);

  // Cancel/delete
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Auto-schedule
  const [generating, setGenerating] = useState(false);
  const [settingUp, setSettingUp] = useState(false);

  useEffect(() => {
    if (!user) return;
    const from = todayIST();
    const to = in14DaysIST();
    Promise.all([
      apiFetch(`/api/classes/instances?from=${from}&to=${to}`).then((r) => r.json()),
      apiFetch('/api/classes/slots').then((r) => r.json()),
    ])
      .then(([instData, slotData]) => {
        const raw: Record<string, unknown>[] = Array.isArray(instData)
          ? instData
          : instData.instances ?? instData.data ?? [];
        setInstances(raw.map(normalizeInstance));
        setSlots(Array.isArray(slotData) ? slotData : slotData.slots ?? slotData.data ?? []);
      })
      .catch((err) => setError(err.message ?? 'Failed to load classes.'))
      .finally(() => setLoading(false));
  }, [user, apiFetch]);

  function flash(text: string) {
    setMsg(text);
    setTimeout(() => setMsg(null), 4000);
  }

  function startEditing(inst: ClassInstance) {
    setEditingId(inst.id);
    setEditStart(toHHMM(inst.startISO || inst.startTime));
    setEditEnd(toHHMM(inst.endISO || inst.endTime));
  }

  async function handleSaveTime(inst: ClassInstance) {
    if (!editStart || !editEnd) return;
    setSavingTime(true);
    try {
      const newStartISO = buildISO(inst.date, editStart);
      const newEndISO = buildISO(inst.date, editEnd);
      const res = await apiFetch(`/api/classes/instances/${inst.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledStartTime: newStartISO, scheduledEndTime: newEndISO }),
      });
      if (!res.ok) throw new Error('Save failed');
      setInstances((prev) =>
        prev.map((i) =>
          i.id === inst.id
            ? { ...i, startTime: displayTime(editStart), endTime: displayTime(editEnd), startISO: newStartISO, endISO: newEndISO }
            : i
        )
      );
      setEditingId(null);
      flash('Time updated.');
    } catch {
      flash('Could not save time. Please try again.');
    } finally {
      setSavingTime(false);
    }
  }

  async function handleCancel(id: string) {
    if (!confirm('Cancel this class?')) return;
    setCancellingId(id);
    try {
      const res = await apiFetch(`/api/classes/instances/${id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Cancelled by teacher' }),
      });
      if (!res.ok) throw new Error('Cancel failed');
      setInstances((prev) =>
        prev.map((i) => (i.id === id ? { ...i, status: 'cancelled' } : i))
      );
    } catch {
      flash('Could not cancel the class. Please try again.');
    } finally {
      setCancellingId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this class? This cannot be undone.')) return;
    setDeletingId(id);
    try {
      const res = await apiFetch(`/api/classes/instances/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      setInstances((prev) => prev.filter((i) => i.id !== id));
    } catch {
      flash('Could not delete the class. Please try again.');
    } finally {
      setDeletingId(null);
    }
  }

  async function handleAutoSchedule() {
    setGenerating(true);
    try {
      const res = await apiFetch('/api/classes/instances/auto-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ daysAhead: 14 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed');
      flash(`${json.created} class${json.created !== 1 ? 'es' : ''} scheduled for the next 14 days.`);
      // Reload
      const from = todayIST();
      const to = in14DaysIST();
      const r2 = await apiFetch(`/api/classes/instances?from=${from}&to=${to}`);
      const d2 = await r2.json();
      const raw2: Record<string, unknown>[] = Array.isArray(d2) ? d2 : d2.instances ?? [];
      setInstances(raw2.map(normalizeInstance));
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Could not generate classes.');
    } finally {
      setGenerating(false);
    }
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
      flash('Schedule created! Click Auto-Schedule to generate this week\'s classes.');
      const slotRes = await apiFetch('/api/classes/slots');
      const slotData = await slotRes.json();
      setSlots(Array.isArray(slotData) ? slotData : slotData.slots ?? []);
    } catch {
      flash('Some slots could not be created. Please try again.');
    } finally {
      setSettingUp(false);
    }
  }

  // Group by day
  const grouped = new Map<string, ClassInstance[]>();
  for (const inst of instances) {
    const key = inst.date.slice(0, 10);
    const bucket = grouped.get(key) ?? [];
    bucket.push(inst);
    grouped.set(key, bucket);
  }
  const sortedDays = Array.from(grouped.keys()).sort();
  const noSlots = !loading && slots.length === 0;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="font-heading text-2xl font-bold text-charcoal">Classes</h1>
        <button
          onClick={handleAutoSchedule}
          disabled={generating || noSlots}
          className="btn-primary text-sm"
        >
          {generating ? 'Scheduling…' : '⚡ Auto-Schedule'}
        </button>
      </div>

      {/* Notification */}
      {msg && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-800">
          {msg}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="card border-red-300 bg-red-50 text-red-800 text-sm">{error}</div>
      )}

      {/* No schedule — first-time setup */}
      {noSlots && (
        <div className="card border-saffron-300 bg-saffron-50 space-y-3">
          <p className="font-semibold text-charcoal">No recurring schedule found</p>
          <p className="text-sm text-gray-600">Default timings:</p>
          <div className="text-sm space-y-1 text-gray-700">
            <p>🟡 <strong>Batch A</strong> — Mon, Wed · 5:30–6:30 AM</p>
            <p>🟠 <strong>Batch B</strong> — Mon, Wed · 4:30–5:30 PM</p>
            <p>🟢 <strong>Batch C</strong> — Tue, Thu · 5:30–6:30 AM</p>
            <p>🟣 <strong>Batch D</strong> — Tue, Thu · 4:30–5:30 PM</p>
          </div>
          <button
            onClick={handleSetupSchedule}
            disabled={settingUp}
            className="btn-primary text-sm"
          >
            {settingUp ? 'Setting up…' : 'Create Default Schedule'}
          </button>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="card animate-pulse">
              <div className="h-3 w-20 bg-gray-200 rounded mb-3" />
              <div className="h-4 w-40 bg-gray-200 rounded mb-2" />
              <div className="h-3 w-24 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && instances.length === 0 && !noSlots && (
        <div className="card flex flex-col items-center py-14 text-center">
          <span className="text-4xl mb-3">📅</span>
          <p className="text-gray-500 text-sm">No classes scheduled for the next 14 days.</p>
          <button onClick={handleAutoSchedule} disabled={generating} className="btn-primary mt-4 text-sm">
            {generating ? 'Scheduling…' : '⚡ Auto-Schedule Now'}
          </button>
        </div>
      )}

      {/* Class list */}
      {!loading && sortedDays.map((day) => (
        <section key={day}>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-1">
            {formatDay(day)}
          </h2>
          <div className="card p-0 divide-y divide-gray-100">
            {grouped.get(day)!.map((inst) => (
              <div key={inst.id} className="px-4 py-3.5">
                {/* Main row */}
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`badge ${BATCH_COLORS[inst.batchBand] ?? 'badge-neutral'}`}>
                      Batch {inst.batchBand}
                    </span>
                    <span className="text-sm font-semibold text-charcoal">
                      {inst.startTime} – {inst.endTime}
                    </span>
                    {inst.enrolledCount != null && inst.enrolledCount > 0 && (
                      <span className="text-xs text-gray-400">
                        {inst.enrolledCount} learner{inst.enrolledCount !== 1 ? 's' : ''}
                      </span>
                    )}
                    {inst.status === 'cancelled' && (
                      <span className="badge badge-error">Cancelled</span>
                    )}
                    {inst.status === 'completed' && (
                      <span className="badge badge-neutral">Done</span>
                    )}
                  </div>

                  {/* Actions */}
                  {inst.status !== 'cancelled' && (
                    <div className="flex items-center gap-3">
                      {/* Attendance: available for active AND completed classes */}
                      <Link
                        href={`/teacher/classes/${inst.id}/attendance`}
                        className="text-xs text-teal-600 hover:text-teal-800 font-medium"
                      >
                        Attendance
                      </Link>
                      {inst.status !== 'completed' && (
                        <>
                          <button
                            onClick={() => editingId === inst.id ? setEditingId(null) : startEditing(inst)}
                            className="text-xs text-saffron-600 hover:text-saffron-800 font-medium"
                          >
                            {editingId === inst.id ? 'Close' : 'Edit time'}
                          </button>
                          <button
                            onClick={() => handleCancel(inst.id)}
                            disabled={cancellingId === inst.id}
                            className="text-xs text-red-400 hover:text-red-600 disabled:opacity-50"
                          >
                            {cancellingId === inst.id ? '…' : 'Cancel'}
                          </button>
                          <button
                            onClick={() => handleDelete(inst.id)}
                            disabled={deletingId === inst.id}
                            className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-50"
                          >
                            {deletingId === inst.id ? '…' : 'Delete'}
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Meet link */}
                {inst.meetLink && (
                  <a
                    href={inst.meetLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-teal-600 hover:underline mt-1"
                  >
                    📹 Join Google Meet
                  </a>
                )}

                {/* Inline time editor */}
                {editingId === inst.id && (
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <label className="text-xs text-gray-500">Start</label>
                      <input
                        type="time"
                        value={editStart}
                        onChange={(e) => setEditStart(e.target.value)}
                        className="input text-sm py-1 px-2 w-28"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <label className="text-xs text-gray-500">End</label>
                      <input
                        type="time"
                        value={editEnd}
                        onChange={(e) => setEditEnd(e.target.value)}
                        className="input text-sm py-1 px-2 w-28"
                      />
                    </div>
                    <button
                      onClick={() => handleSaveTime(inst)}
                      disabled={savingTime}
                      className="btn-primary text-xs px-3 py-1.5"
                    >
                      {savingTime ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
