/**
 * Manage Classes — /teacher/classes
 *
 * Shows today and upcoming week's class instances.
 * If no slots configured, shows Setup Schedule banner.
 * Actions: Meet Link, Cancel, Attendance.
 */

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuthContext } from '@/components/layout/AuthProvider';

type InstanceStatus = 'scheduled' | 'live' | 'completed' | 'cancelled';
type BatchBandCode = 'A' | 'B' | 'C' | 'D';

interface ClassInstance {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  batchBand: BatchBandCode;
  batchBandId?: string;
  studentCount: number;
  status: InstanceStatus;
  meetLink?: string;
  scheduledStartTime?: string;
  scheduledEndTime?: string;
}

interface ClassSlot {
  id: string;
  batchBandId?: string;
  dayOfWeek: number;
  startTimeLocal: string;
  endTimeLocal: string;
}

const DEFAULT_SCHEDULE = [
  { batchBandCode: 'A', days: 'Mon, Wed', time: '5:30 – 6:30 AM', dayOfWeek: [1, 3], start: '05:30', end: '06:30' },
  { batchBandCode: 'B', days: 'Mon, Wed', time: '4:30 – 5:30 PM', dayOfWeek: [1, 3], start: '16:30', end: '17:30' },
  { batchBandCode: 'C', days: 'Tue, Thu',  time: '5:30 – 6:30 AM', dayOfWeek: [2, 4], start: '05:30', end: '06:30' },
  { batchBandCode: 'D', days: 'Tue, Thu',  time: '4:30 – 5:30 PM', dayOfWeek: [2, 4], start: '16:30', end: '17:30' },
] as const;

function toYMD(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function todayIST(): string {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })).toISOString().slice(0, 10);
}

function nextWeekIST(): string {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
}

function statusBadgeClass(status: InstanceStatus): string {
  switch (status) {
    case 'scheduled':  return 'badge badge-info';
    case 'live':       return 'badge badge-success';
    case 'completed':  return 'badge badge-neutral';
    case 'cancelled':  return 'badge badge-error';
    default:           return 'badge badge-neutral';
  }
}

function batchBadgeClass(band: string): string {
  switch (band) {
    case 'A': return 'badge bg-amber-100 text-amber-800';
    case 'B': return 'badge bg-orange-100 text-orange-800';
    case 'C': return 'badge bg-teal-100 text-teal-800';
    case 'D': return 'badge bg-purple-100 text-purple-800';
    default:  return 'badge badge-neutral';
  }
}

function formatDay(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

function normalizeInstance(inst: Record<string, unknown>): ClassInstance {
  let date = (inst.date as string) ?? '';
  let startTime = (inst.startTime as string) ?? '';
  let endTime = (inst.endTime as string) ?? '';

  if (!date && inst.scheduledStartTime) {
    const st = inst.scheduledStartTime as string;
    date = st.slice(0, 10);
    const timeStr = st.slice(11, 16);
    const endStr = (inst.scheduledEndTime as string)?.slice(11, 16) ?? '';
    const toHHMM = (t: string) => {
      const [h, m] = t.split(':').map(Number);
      const ampm = h < 12 ? 'AM' : 'PM';
      const h12 = h % 12 || 12;
      return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
    };
    startTime = toHHMM(timeStr);
    endTime = toHHMM(endStr);
  }

  return {
    id: inst.id as string,
    date,
    startTime,
    endTime,
    batchBand: ((inst.batchBand as string) ?? (inst.batchBandId as string) ?? '') as BatchBandCode,
    batchBandId: inst.batchBandId as string,
    studentCount: (inst.studentCount as number) ?? 0,
    status: (inst.status as InstanceStatus) ?? 'scheduled',
    meetLink: (inst.meetLink as string) ?? (inst.googleMeetLink as string) ?? undefined,
  };
}

function groupByDay(instances: ClassInstance[]): Map<string, ClassInstance[]> {
  const map = new Map<string, ClassInstance[]>();
  for (const inst of instances) {
    const key = inst.date.slice(0, 10);
    const bucket = map.get(key) ?? [];
    bucket.push(inst);
    map.set(key, bucket);
  }
  return map;
}

export default function ManageClassesPage() {
  const { user, apiFetch } = useAuthContext();
  const [instances, setInstances] = useState<ClassInstance[]>([]);
  const [slots, setSlots] = useState<ClassSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [meetLinkId, setMeetLinkId] = useState<string | null>(null);
  const [meetLinkInput, setMeetLinkInput] = useState('');
  const [savingMeet, setSavingMeet] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genMsg, setGenMsg] = useState<string | null>(null);
  const [settingUp, setSettingUp] = useState(false);
  const [setupMsg, setSetupMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const from = todayIST();
    const to = nextWeekIST();
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

  async function handleCancel(id: string) {
    if (!confirm('Cancel this class instance?')) return;
    setCancellingId(id);
    try {
      const res = await apiFetch(`/api/classes/instances/${id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Cancelled by teacher' }),
      });
      if (!res.ok) throw new Error('Cancel failed');
      setInstances((prev) =>
        prev.map((inst) => (inst.id === id ? { ...inst, status: 'cancelled' } : inst))
      );
    } catch {
      alert('Could not cancel the class. Please try again.');
    } finally {
      setCancellingId(null);
    }
  }

  async function handleSaveMeetLink(id: string) {
    if (!meetLinkInput.trim()) return;
    setSavingMeet(true);
    try {
      const res = await apiFetch(`/api/classes/instances/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meetLink: meetLinkInput.trim() }),
      });
      if (!res.ok) throw new Error('Save failed');
      setInstances((prev) =>
        prev.map((inst) =>
          inst.id === id ? { ...inst, meetLink: meetLinkInput.trim() } : inst
        )
      );
      setMeetLinkId(null);
      setMeetLinkInput('');
    } catch {
      alert('Could not save Meet link. Please try again.');
    } finally {
      setSavingMeet(false);
    }
  }

  async function handleGenerateInstances() {
    setGenerating(true);
    setGenMsg(null);
    try {
      const res = await apiFetch('/api/classes/instances/auto-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ daysAhead: 14 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed');
      setGenMsg(`&#x2705; ${json.created} class instance${json.created !== 1 ? 's' : ''} generated for the next 14 days.`);
      const from = todayIST();
      const to = nextWeekIST();
      const r2 = await apiFetch(`/api/classes/instances?from=${from}&to=${to}`);
      const d2 = await r2.json();
      const raw2: Record<string, unknown>[] = Array.isArray(d2) ? d2 : d2.instances ?? [];
      setInstances(raw2.map(normalizeInstance));
    } catch (e: unknown) {
      setGenMsg('&#x26A0;&#xFE0F; ' + (e instanceof Error ? e.message : 'Could not generate instances.'));
    } finally {
      setGenerating(false);
      setTimeout(() => setGenMsg(null), 5000);
    }
  }

  async function handleSetupDefaultSchedule() {
    if (!confirm('Create the default 4-batch schedule? This creates 8 recurring class slots.')) return;
    setSettingUp(true);
    setSetupMsg('Setting up schedule…');
    try {
      let created = 0;
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
          created++;
          setSetupMsg(`Creating slots… ${created}/8`);
        }
      }
      setSetupMsg('&#x2705; Schedule created! Click Auto-Schedule to generate this week\'s classes.');
      const slotRes = await apiFetch('/api/classes/slots');
      const slotData = await slotRes.json();
      setSlots(Array.isArray(slotData) ? slotData : slotData.slots ?? []);
    } catch {
      setSetupMsg('&#x26A0;&#xFE0F; Some slots could not be created. Please try again.');
    } finally {
      setSettingUp(false);
    }
  }

  const grouped = groupByDay(instances);
  const sortedDays = Array.from(grouped.keys()).sort();
  const noSlots = !loading && slots.length === 0;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-heading text-2xl font-bold text-charcoal">Classes</h1>
          <p className="text-sm text-gray-500 mt-0.5">Today and upcoming week</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={handleGenerateInstances} disabled={generating || noSlots} className="btn-secondary text-sm">
            {generating ? 'Generating…' : '&#x26A1; Auto-Schedule'}
          </button>
          <Link href="/teacher/classes/new" className="btn-secondary text-sm">
            Edit Schedule
          </Link>
        </div>
      </div>

      {/* Setup banner */}
      {noSlots && (
        <div className="card border-saffron-300 bg-saffron-50 space-y-3">
          <p className="font-semibold text-charcoal">No class schedule found</p>
          <p className="text-sm text-gray-600">
            Your standard schedule is:
          </p>
          <div className="text-sm space-y-1 text-gray-700">
            <p>&#x1F7E1; <strong>Batch A</strong> — Mon, Wed · 5:30–6:30 AM</p>
            <p>&#x1F7E0; <strong>Batch B</strong> — Mon, Wed · 4:30–5:30 PM</p>
            <p>&#x1F7E2; <strong>Batch C</strong> — Tue, Thu · 5:30–6:30 AM</p>
            <p>&#x1F7E3; <strong>Batch D</strong> — Tue, Thu · 4:30–5:30 PM</p>
          </div>
          {setupMsg && (
            <p className="text-sm text-saffron-700" dangerouslySetInnerHTML={{ __html: setupMsg }} />
          )}
          <div className="flex gap-2">
            <button
              onClick={handleSetupDefaultSchedule}
              disabled={settingUp}
              className="btn-primary text-sm"
            >
              {settingUp ? 'Creating…' : 'Setup Default Schedule'}
            </button>
            <Link href="/teacher/classes/new" className="btn-secondary text-sm">
              Custom Setup
            </Link>
          </div>
        </div>
      )}

      {genMsg && (
        <div
          className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-800"
          dangerouslySetInnerHTML={{ __html: genMsg }}
        />
      )}

      {/* Error */}
      {error && (
        <div className="card border-red-300 bg-red-50 text-red-800 text-sm">
          &#9888;&#65039; {error}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="card p-0 divide-y divide-gray-100">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-4 animate-pulse">
              <div className="flex-1 space-y-2">
                <div className="h-3 w-28 bg-gray-200 rounded" />
                <div className="h-2.5 w-16 bg-gray-200 rounded" />
              </div>
              <div className="h-5 w-14 bg-gray-200 rounded-full" />
              <div className="h-7 w-20 bg-gray-200 rounded-lg" />
            </div>
          ))}
        </div>
      ) : instances.length === 0 ? (
        <div className="card flex flex-col items-center py-16 text-center">
          <span className="text-4xl mb-3">&#x1F4C5;</span>
          <p className="text-gray-500 text-sm">No classes scheduled for this week.</p>
          {slots.length > 0 && (
            <button onClick={handleGenerateInstances} disabled={generating} className="btn-primary mt-4 text-sm">
              {generating ? 'Generating…' : '&#x26A1; Auto-Schedule This Week'}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {sortedDays.map((day) => (
            <section key={day}>
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-1">
                {formatDay(day)}
              </h2>
              <div className="card p-0 divide-y divide-gray-100">
                {grouped.get(day)!.map((inst) => (
                  <div key={inst.id} className="px-5 py-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-charcoal">
                            {inst.startTime} – {inst.endTime}
                          </span>
                          <span className={batchBadgeClass(inst.batchBand)}>
                            Batch {inst.batchBand}
                          </span>
                          <span className={statusBadgeClass(inst.status)}>
                            {inst.status}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          {inst.studentCount} student{inst.studentCount !== 1 ? 's' : ''} enrolled
                        </p>
                        {inst.meetLink && (
                          <a
                            href={inst.meetLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-teal-600 hover:underline mt-1 font-medium"
                          >
                            &#x1F4F9; Join Google Meet
                          </a>
                        )}
                      </div>

                      {inst.status !== 'cancelled' && (
                        <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0">
                          {/* Attendance available for active and completed classes */}
                          <Link
                            href={`/teacher/classes/${inst.id}/attendance`}
                            className="btn-primary text-xs px-3 py-1.5"
                          >
                            Attendance
                          </Link>
                          {inst.status !== 'completed' && (
                            <>
                              <button
                                onClick={() => {
                                  setMeetLinkId(inst.id);
                                  setMeetLinkInput(inst.meetLink ?? '');
                                }}
                                className="btn-secondary text-xs px-3 py-1.5"
                              >
                                Meet Link
                              </button>
                              <button
                                onClick={() => handleCancel(inst.id)}
                                disabled={cancellingId === inst.id}
                                className="text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                              >
                                {cancellingId === inst.id ? '…' : 'Cancel'}
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    {meetLinkId === inst.id && (
                      <div className="mt-3 flex items-center gap-2">
                        <input
                          type="url"
                          placeholder="https://meet.google.com/..."
                          value={meetLinkInput}
                          onChange={(e) => setMeetLinkInput(e.target.value)}
                          className="input text-xs"
                        />
                        <button
                          onClick={() => handleSaveMeetLink(inst.id)}
                          disabled={savingMeet}
                          className="btn-primary text-xs px-3 py-1.5 whitespace-nowrap"
                        >
                          {savingMeet ? 'Saving…' : 'Save'}
                        </button>
                        <button
                          onClick={() => setMeetLinkId(null)}
                          className="btn-secondary text-xs px-3 py-1.5"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
