/**
 * Manage Classes — /teacher/classes
 *
 * Lists class instances for today and the upcoming week.
 * Actions: Mark Attendance, Create Meet Link, Cancel.
 */

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuthContext } from '@/components/layout/AuthProvider';

type InstanceStatus = 'scheduled' | 'live' | 'completed' | 'cancelled';
type BatchBandCode = 'A' | 'B' | 'C' | 'D';

interface ClassInstance {
  id: string;
  date: string;         // ISO date
  startTime: string;    // HH:MM
  endTime: string;      // HH:MM
  batchBand: BatchBandCode;
  studentCount: number;
  status: InstanceStatus;
  meetLink?: string;
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

function batchBadgeClass(band: BatchBandCode): string {
  switch (band) {
    case 'A': return 'badge bg-amber-100 text-amber-800';
    case 'B': return 'badge bg-orange-100 text-orange-800';
    case 'C': return 'badge bg-teal-100 text-teal-800';
    case 'D': return 'badge bg-purple-100 text-purple-800';
    default:  return 'badge badge-neutral';
  }
}

function formatDay(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
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

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 px-5 py-4 animate-pulse">
      <div className="flex-1 space-y-2">
        <div className="h-3 w-28 bg-gray-200 rounded" />
        <div className="h-2.5 w-16 bg-gray-200 rounded" />
      </div>
      <div className="h-5 w-14 bg-gray-200 rounded-full" />
      <div className="h-5 w-10 bg-gray-200 rounded-full" />
      <div className="h-7 w-20 bg-gray-200 rounded-lg" />
    </div>
  );
}

export default function ManageClassesPage() {
  const { user, apiFetch } = useAuthContext();
  const [instances, setInstances] = useState<ClassInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [meetLinkId, setMeetLinkId] = useState<string | null>(null);
  const [meetLinkInput, setMeetLinkInput] = useState('');
  const [savingMeet, setSavingMeet] = useState(false);

  useEffect(() => {
    if (!user) return;
    apiFetch('/api/classes/instances?from=today&to=nextWeek')
      .then((r) => r.json())
      .then((data) => setInstances(Array.isArray(data) ? data : data.instances ?? []))
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

  const grouped = groupByDay(instances);
  const sortedDays = Array.from(grouped.keys()).sort();

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-charcoal">Classes</h1>
          <p className="text-sm text-gray-500 mt-0.5">Today and upcoming week</p>
        </div>
        <Link href="/teacher/classes/new" className="btn-primary">
          + New Slot
        </Link>
      </div>

      {/* Error */}
      {error && (
        <div className="card border-red-300 bg-red-50 text-red-800 text-sm">
          ⚠️ {error}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="card p-0 divide-y divide-gray-100">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : instances.length === 0 ? (
        <div className="card flex flex-col items-center py-16 text-center">
          <span className="text-4xl mb-3">📅</span>
          <p className="text-gray-500 text-sm">No classes scheduled for this week.</p>
          <Link href="/teacher/classes/new" className="btn-primary mt-4">
            Create a Class Slot
          </Link>
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
                      {/* Time + Batch */}
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
                            className="text-xs text-teal-600 hover:underline mt-1 block truncate max-w-xs"
                          >
                            {inst.meetLink}
                          </a>
                        )}
                      </div>

                      {/* Actions */}
                      {inst.status !== 'cancelled' && inst.status !== 'completed' && (
                        <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0">
                          <Link
                            href={`/teacher/classes/${inst.id}/attendance`}
                            className="btn-primary text-xs px-3 py-1.5"
                          >
                            Attendance
                          </Link>
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
                            className="btn-danger text-xs px-3 py-1.5 disabled:opacity-50"
                          >
                            {cancellingId === inst.id ? 'Cancelling…' : 'Cancel'}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Meet Link inline form */}
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
