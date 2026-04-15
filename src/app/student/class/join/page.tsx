/**
 * Student — My Classes
 * Shows upcoming class instances for the student's batch (next 14 days).
 * Today's classes show a Join button. Future classes show the date.
 * Auto-marks attendance when Meet link is clicked.
 */

'use client';

import { useEffect, useState } from 'react';
import { useAuthContext } from '@/components/layout/AuthProvider';

interface ClassInstance {
  id: string;
  scheduledStartTime: string;
  scheduledEndTime: string;
  meetLink?: string | null;
  googleMeetLink?: string | null;
  status: string;
  batchBandId: string;
  batchBand?: string;
}

// Use Intl.DateTimeFormat so the IST calendar date is correct for any viewer timezone.
// new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }) re-parses an IST
// string as local time, giving a wrong epoch for anyone outside IST.
function istDateOffset(days: number): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  });
  return fmt.format(new Date(Date.now() + days * 86400000));
}

function todayIST(): string { return istDateOffset(0); }
function plusDaysIST(days: number): string { return istDateOffset(days); }

function formatDate(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00');
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
}

function formatTime(timeStr: string): string {
  if (!timeStr) return '';
  if (timeStr.includes('T')) {
    return new Date(timeStr).toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata',
    });
  }
  return timeStr;
}

export default function JoinClassPage() {
  const { apiFetch } = useAuthContext();
  const [instances, setInstances] = useState<ClassInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [noBatch, setNoBatch] = useState(false);
  const [attendanceMsg, setAttendanceMsg] = useState<string | null>(null);

  useEffect(() => {
    const from = todayIST();
    const to = plusDaysIST(14);
    apiFetch(`/api/classes/instances?from=${from}&to=${to}`)
      .then((r) => r.json())
      .then((data) => {
        setInstances(data.instances ?? []);
        if (data.noBatch) setNoBatch(true);
      })
      .catch(() => setError('Could not load your classes'))
      .finally(() => setLoading(false));
  }, [apiFetch]);

  // Timezone-safe: scheduledStartTime is offset-aware (e.g. 2026-04-16T07:30:00+05:30).
  // new Date(iso).getTime() gives the correct UTC epoch on any device.
  // Do NOT use new Date(...toLocaleString) — that re-parses IST as local time, shifting the epoch.
  function getJoinStatus(instance: ClassInstance) {
    const now = Date.now();
    const start = new Date(instance.scheduledStartTime).getTime();
    const end = new Date(instance.scheduledEndTime).getTime();
    const minsUntilStart = (start - now) / 60000;
    if (instance.status === 'cancelled') return 'cancelled';
    if (instance.status === 'completed' || end < now) return 'ended';
    // Live: from 15 min before start through the entire session
    if (minsUntilStart <= 15) return 'live';
    return 'upcoming';
  }

  async function handleJoin(instance: ClassInstance, link: string) {
    try {
      const res = await apiFetch('/api/attendance/auto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classInstanceId: instance.id }),
      });
      const json = await res.json();
      if (json.message) {
        setAttendanceMsg(json.message);
        setTimeout(() => setAttendanceMsg(null), 5000);
      }
    } catch { /* non-blocking */ }
    window.open(link, '_blank', 'noopener,noreferrer');
  }

  // Group by date (YYYY-MM-DD)
  const grouped = new Map<string, ClassInstance[]>();
  for (const inst of instances) {
    const key = inst.scheduledStartTime.slice(0, 10);
    const bucket = grouped.get(key) ?? [];
    bucket.push(inst);
    grouped.set(key, bucket);
  }
  const sortedDays = Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
      <div>
        <h1 className="section-title">My Classes</h1>
        <p className="text-xs text-gray-400 mt-0.5">
          Upcoming classes for your batch — next 14 days.
        </p>
      </div>

      {attendanceMsg && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-2 text-sm text-green-800">
          ✅ {attendanceMsg}
        </div>
      )}

      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card animate-pulse">
              <div className="h-3 bg-gray-200 rounded w-1/4 mb-3" />
              <div className="h-4 bg-gray-200 rounded w-1/3 mb-2" />
              <div className="h-3 bg-gray-100 rounded w-1/2" />
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="card border-red-100 bg-red-50">
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}

      {!loading && noBatch && (
        <div className="card text-center py-10 border-amber-200 bg-amber-50">
          <div className="text-4xl mb-3">🎵</div>
          <p className="text-amber-800 font-medium">You haven&apos;t selected a batch yet</p>
          <p className="text-amber-700 text-sm mt-1">Please select your batch to see your classes.</p>
          <a href="/student/onboarding" className="btn-primary mt-4 inline-block">
            Select My Batch
          </a>
        </div>
      )}

      {!loading && !noBatch && !error && sortedDays.length === 0 && (
        <div className="card text-center py-10">
          <div className="text-4xl mb-3">📅</div>
          <p className="text-gray-600 font-medium">No upcoming classes scheduled</p>
          <p className="text-gray-400 text-sm mt-1">
            Classes are scheduled Mon/Wed (Batch A &amp; B) and Tue/Thu (Batch C &amp; D).
            Your teacher will generate the schedule shortly.
          </p>
        </div>
      )}

      {!loading && sortedDays.map(([dateKey, dayInstances]) => (
        <section key={dateKey}>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            {formatDate(dateKey)}
          </h2>
          <div className="space-y-3">
            {dayInstances.map((instance) => {
              const joinStatus = getJoinStatus(instance);
              const link = instance.meetLink || instance.googleMeetLink;
              const isToday = dateKey === todayIST();

              return (
                <div key={instance.id} className="card">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-charcoal">
                        {formatTime(instance.scheduledStartTime)} – {formatTime(instance.scheduledEndTime)} IST
                      </p>
                      <p className="text-sm text-gray-500 mt-0.5">
                        Batch {instance.batchBand || instance.batchBandId}
                      </p>
                    </div>
                    <span className={`badge flex-shrink-0 ${
                      joinStatus === 'live' ? 'badge-success' :
                      joinStatus === 'upcoming' ? 'badge-info' :
                      joinStatus === 'cancelled' ? 'badge-error' : 'badge-neutral'
                    }`}>
                      {joinStatus === 'live' ? 'Live Now' :
                       joinStatus === 'cancelled' ? 'Cancelled' :
                       joinStatus === 'ended' ? 'Ended' : 'Upcoming'}
                    </span>
                  </div>

                  {joinStatus !== 'cancelled' && joinStatus !== 'ended' && link && (
                    <div className="mt-3">
                      <button
                        onClick={() => handleJoin(instance, link)}
                        className="btn-primary w-full text-center"
                      >
                        {joinStatus === 'live' ? '🔴 Join Live — Google Meet' : 'Join Google Meet'}
                      </button>
                    </div>
                  )}

                  {joinStatus !== 'cancelled' && joinStatus !== 'ended' && !link && (
                    <p className="text-xs text-gray-400 mt-2">Meet link not yet available</p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
