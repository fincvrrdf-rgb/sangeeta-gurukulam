/**
 * Student — My Classes
 * One Join button using the batch's permanent Meet link. Clicking it records
 * attendance for today's class (the server finds it) and opens Meet.
 * Shows when the next class is — no per-date list.
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

  // Timezone-safe: scheduledStartTime is offset-aware, so Date parsing gives the right epoch anywhere.
  const now = Date.now();
  const active = instances
    .filter((i) => !String(i.status).includes('cancel') && new Date(i.scheduledEndTime).getTime() > now)
    .sort((a, b) => a.scheduledStartTime.localeCompare(b.scheduledStartTime));
  const nextClass = active[0] ?? null;
  const isLive = !!nextClass && new Date(nextClass.scheduledStartTime).getTime() - now <= 15 * 60_000;

  // The batch's single stable link (same for every class — API guarantees this)
  const withLink = instances.find((i) => i.meetLink || i.googleMeetLink);
  const stableLink = withLink ? (withLink.meetLink || withLink.googleMeetLink) : null;
  const batchLabel = withLink ? (withLink.batchBand || withLink.batchBandId) : '';

  async function handleJoin(link: string) {
    // Open Meet first so pop-up blockers don't stop it, then record attendance
    window.open(link, '_blank', 'noopener,noreferrer');
    try {
      const res = await apiFetch('/api/attendance/auto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (json.message) {
        setAttendanceMsg(json.message);
        setTimeout(() => setAttendanceMsg(null), 6000);
      }
    } catch { /* non-blocking */ }
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
      <div>
        <h1 className="section-title">My Class</h1>
        <p className="text-xs text-gray-400 mt-0.5">
          Your attendance is recorded when you click Join.
        </p>
      </div>

      {attendanceMsg && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-2 text-sm text-green-800">
          ✅ {attendanceMsg}
        </div>
      )}

      {loading && (
        <div className="card animate-pulse space-y-3">
          <div className="h-4 bg-gray-200 rounded w-1/3" />
          <div className="h-10 bg-gray-200 rounded" />
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

      {!loading && !noBatch && !error && (
        <div className="card space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-charcoal">Batch {batchLabel}</p>
              {nextClass ? (
                <p className="text-sm text-gray-500 mt-0.5">
                  {isLive ? 'Class is on now' : 'Next class'}: {formatDate(nextClass.scheduledStartTime.slice(0, 10))},{' '}
                  {formatTime(nextClass.scheduledStartTime)} – {formatTime(nextClass.scheduledEndTime)} IST
                </p>
              ) : (
                <p className="text-sm text-gray-500 mt-0.5">No upcoming class scheduled yet.</p>
              )}
            </div>
            {isLive && <span className="badge badge-success flex-shrink-0">Live Now</span>}
          </div>

          {stableLink ? (
            <>
              <button onClick={() => handleJoin(stableLink)} className="btn-primary w-full text-center">
                {isLive ? '🔴 Join Class — Google Meet' : 'Join Class — Google Meet'}
              </button>
              <p className="text-xs text-gray-400 text-center">
                {stableLink.replace('https://', '')} · same link for every class
              </p>
            </>
          ) : (
            <p className="text-xs text-gray-400">Class link not set yet — please check with your teacher.</p>
          )}
        </div>
      )}
    </div>
  );
}
