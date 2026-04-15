/**
 * Student — Join a live class.
 * Shows today's scheduled class instances filtered to the student's batch.
 * Auto-marks attendance when Meet link is clicked.
 *
 * Schedule:
 *   Mon/Wed — Batch A (morning 5:30–6:30) / Batch B (evening 4:30–5:30)
 *   Tue/Thu — Batch C (morning 5:30–6:30) / Batch D (evening 4:30–5:30)
 *   Saturday — Testing / Bhajan (all batches)
 */

'use client';

import { useEffect, useState } from 'react';
import { useAuthContext } from '@/components/layout/AuthProvider';

interface ClassInstance {
  id: string;
  scheduledDate?: string;
  scheduledStartTime: string;
  scheduledEndTime: string;
  meetLink?: string;
  googleMeetLink?: string;
  status: string;
  batchBandId: string;
  batchBand?: string;
}

const SCHEDULE_INFO: Record<string, string> = {
  '1': 'Monday — Batch A (5:30 AM) · Batch B (4:30 PM)',
  '2': 'Tuesday — Batch C (5:30 AM) · Batch D (4:30 PM)',
  '3': 'Wednesday — Batch A (5:30 AM) · Batch B (4:30 PM)',
  '4': 'Thursday — Batch C (5:30 AM) · Batch D (4:30 PM)',
  '6': 'Saturday — Testing / All Batches',
};

export default function JoinClassPage() {
  const { apiFetch } = useAuthContext();
  const [instances, setInstances] = useState<ClassInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attendanceMsg, setAttendanceMsg] = useState<string | null>(null);

  // Use IST calendar date so US/international students query the correct day's classes.
  // new Date().toISOString() gives UTC date which can be the wrong calendar day for
  // students in timezones behind IST (e.g. California at 6 PM is still yesterday UTC).
  const todayIST = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  // Day-of-week in IST for the schedule note
  const istDow = String(new Date(todayIST + 'T00:00:00+05:30').getDay());
  const scheduleNote = SCHEDULE_INFO[istDow];

  useEffect(() => {
    apiFetch(`/api/classes/instances?from=${todayIST}&to=${todayIST}`)
      .then((r) => r.json())
      .then((data) => setInstances(data.instances ?? []))
      .catch(() => setError("Could not load today's classes"))
      .finally(() => setLoading(false));
  }, [apiFetch, todayIST]);

  // Timezone-safe status: scheduledStartTime is an offset-aware ISO string (e.g. +05:30).
  // new Date(iso).getTime() gives the correct UTC epoch regardless of the viewer's timezone.
  // Never extract .getHours() from a parsed IST timestamp — that gives local-timezone hours.
  function getStatus(instance: ClassInstance) {
    const now = Date.now();
    const start = new Date(instance.scheduledStartTime).getTime();
    const end = new Date(instance.scheduledEndTime).getTime();
    const minsUntilStart = (start - now) / 60000;
    if (instance.status === 'cancelled') return 'cancelled';
    if (instance.status === 'completed' || end < now) return 'ended';
    // Joinable: from 15 min before start through the full session duration
    if (minsUntilStart <= 15) return 'joinable';
    return 'upcoming';
  }

  function formatTime(timeStr: string): string {
    if (timeStr.includes('T')) {
      return new Date(timeStr).toLocaleTimeString('en-IN', {
        hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata',
      });
    }
    return timeStr;
  }

  async function handleJoin(instance: ClassInstance, link: string) {
    // Auto-mark attendance silently
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
    } catch {
      // Non-blocking — open meet link regardless
    }
    window.open(link, '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
      <div>
        <h1 className="section-title">Join Class</h1>
        {scheduleNote && (
          <p className="text-xs text-gray-500 mt-0.5">
            Today: {scheduleNote}
          </p>
        )}
        <p className="text-xs text-gray-400 mt-0.5">
          Only classes for your batch are shown. Joining within 15 min late = present; after = absent.
        </p>
      </div>

      {attendanceMsg && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-2 text-sm text-green-800">
          ✅ {attendanceMsg}
        </div>
      )}

      {loading && (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="card animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-1/3 mb-3" />
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

      {!loading && !error && instances.length === 0 && (
        <div className="card text-center py-10">
          <div className="text-4xl mb-3">📅</div>
          <p className="text-gray-600 font-medium">No classes scheduled for your batch today</p>
          <p className="text-gray-400 text-sm mt-1">
            {scheduleNote
              ? `Today is ${scheduleNote}. Check with your teacher if you expected a class.`
              : 'No classes today. Regular schedule: Mon/Wed (Batch A&B) · Tue/Thu (Batch C&D).'}
          </p>
        </div>
      )}

      <div className="space-y-4">
        {instances.map((instance) => {
          const classStatus = getStatus(instance);
          const link = instance.meetLink || instance.googleMeetLink;
          return (
            <div key={instance.id} className="card">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-charcoal">
                    {formatTime(instance.scheduledStartTime)} – {formatTime(instance.scheduledEndTime)} IST
                  </p>
                  <p className="text-sm text-gray-500 mt-0.5">Batch {instance.batchBand || instance.batchBandId}</p>
                </div>
                <span className={`badge ${
                  classStatus === 'joinable' ? 'badge-success' :
                  classStatus === 'upcoming' ? 'badge-warning' : 'badge-neutral'
                }`}>
                  {classStatus === 'joinable' ? '🔴 Live' :
                   classStatus === 'upcoming' ? '⏰ Upcoming' : 'Ended'}
                </span>
              </div>

              <div className="mt-4">
                {link ? (
                  <button
                    onClick={() => handleJoin(instance, link)}
                    disabled={classStatus === 'ended'}
                    className={`btn-primary w-full text-center ${
                      classStatus === 'ended' ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    {classStatus === 'joinable' ? 'Join Google Meet' :
                     classStatus === 'upcoming' ? 'Meet Link Ready (opens when class starts)' : 'Class Ended'}
                  </button>
                ) : (
                  <div className="btn-secondary w-full text-center opacity-60 cursor-not-allowed">
                    Meet link not yet available
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
