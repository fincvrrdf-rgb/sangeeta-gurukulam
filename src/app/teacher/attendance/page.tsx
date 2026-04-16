/**
 * Attendance — /teacher/attendance
 *
 * Dedicated page for marking and editing attendance.
 * Shows all classes from the past 7 days through today, grouped by date.
 * Each row shows attendance status (marked / unmarked) and links to the mark/edit form.
 */

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuthContext } from '@/components/layout/AuthProvider';

interface ClassRow {
  id: string;
  date: string;        // YYYY-MM-DD
  startTime: string;   // "7:30 AM"
  endTime: string;
  batchBand: string;
  status: string;
  enrolledCount: number;
  attendanceMarked: boolean; // whether any record exists for this class
}

function istDateOffset(days: number): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  });
  return fmt.format(new Date(Date.now() + days * 86400000));
}

function displayTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata',
  });
}

function formatDay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const todayStr = new Date().toDateString();
  const yestStr = new Date(Date.now() - 86400000).toDateString();
  if (d.toDateString() === todayStr) return 'Today';
  if (d.toDateString() === yestStr) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
}

const BATCH_COLORS: Record<string, string> = {
  A: 'badge-info',
  B: 'badge-success',
  C: 'badge-warning',
  D: 'bg-purple-100 text-purple-800',
};

function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 px-5 py-4 animate-pulse">
      <div className="flex-1 space-y-1.5">
        <div className="h-3.5 w-36 bg-gray-200 rounded" />
        <div className="h-3 w-24 bg-gray-100 rounded" />
      </div>
      <div className="h-6 w-20 bg-gray-200 rounded-full" />
      <div className="h-8 w-28 bg-gray-200 rounded-lg" />
    </div>
  );
}

export default function TeacherAttendancePage() {
  const { user, apiFetch } = useAuthContext();
  const [rows, setRows] = useState<ClassRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    const from = istDateOffset(-7);
    const to = istDateOffset(1); // include today + tomorrow morning classes

    apiFetch(`/api/classes/instances?from=${from}&to=${to}`)
      .then((r) => r.json())
      .then(async (data) => {
        const instances: Record<string, unknown>[] = Array.isArray(data)
          ? data : data.instances ?? [];

        // For each instance, check if attendance has been recorded
        const enriched = await Promise.all(
          instances.map(async (inst) => {
            const instanceId = inst.id as string;
            let attendanceMarked = false;
            try {
              const ar = await apiFetch(`/api/classes/instances/${instanceId}/attendance`).then((r) => r.json());
              attendanceMarked = Object.keys(ar.attendance ?? {}).length > 0;
            } catch { /* non-fatal */ }

            const startISO = (inst.scheduledStartTime as string) ?? '';
            const endISO = (inst.scheduledEndTime as string) ?? '';
            const date = startISO.slice(0, 10) || ((inst.date as string) ?? '');

            return {
              id: instanceId,
              date,
              startTime: startISO ? displayTime(startISO) : (inst.startTime as string) ?? '',
              endTime: endISO ? displayTime(endISO) : (inst.endTime as string) ?? '',
              batchBand: (inst.batchBand as string) ?? '',
              status: (inst.status as string) ?? 'scheduled',
              enrolledCount: (inst.enrolledCount as number) ?? 0,
              attendanceMarked,
            } as ClassRow;
          })
        );

        // Sort: most recent first
        enriched.sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime));
        setRows(enriched);
      })
      .catch((err) => setError(err.message ?? 'Failed to load classes.'))
      .finally(() => setLoading(false));
  }, [user, apiFetch]);

  // Group by date
  const grouped = new Map<string, ClassRow[]>();
  for (const row of rows) {
    const bucket = grouped.get(row.date) ?? [];
    bucket.push(row);
    grouped.set(row.date, bucket);
  }
  const sortedDates = Array.from(grouped.keys()).sort().reverse(); // newest first

  const unmarkedCount = rows.filter(
    (r) => !r.attendanceMarked && r.status !== 'cancelled'
  ).length;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-heading text-2xl font-bold text-charcoal">Attendance</h1>
        <p className="text-sm text-gray-500 mt-1">
          {loading ? 'Loading…' : (
            unmarkedCount > 0
              ? `${unmarkedCount} class${unmarkedCount !== 1 ? 'es' : ''} need attendance`
              : 'All classes marked'
          )}
        </p>
      </div>

      {error && (
        <div className="card border-red-300 bg-red-50 text-red-800 text-sm">⚠️ {error}</div>
      )}

      {loading ? (
        <div className="card p-0 divide-y divide-gray-100">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="card flex flex-col items-center py-14 text-center">
          <span className="text-4xl mb-3">✅</span>
          <p className="text-gray-500 text-sm">No classes in the past 7 days.</p>
        </div>
      ) : (
        sortedDates.map((date) => (
          <section key={date}>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-1">
              {formatDay(date)}
            </h2>
            <div className="card p-0 divide-y divide-gray-100">
              {grouped.get(date)!.map((row) => (
                <div key={row.id} className="flex items-center gap-3 px-5 py-4">
                  {/* Batch + time */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`badge ${BATCH_COLORS[row.batchBand] ?? 'badge-neutral'}`}>
                        Batch {row.batchBand}
                      </span>
                      <span className="text-sm font-semibold text-charcoal">
                        {row.startTime} – {row.endTime}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {row.enrolledCount > 0 ? `${row.enrolledCount} learner${row.enrolledCount !== 1 ? 's' : ''}` : ''}
                      {row.status === 'cancelled' ? ' · Cancelled' : ''}
                    </p>
                  </div>

                  {/* Status badge */}
                  {row.status !== 'cancelled' && (
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${
                      row.attendanceMarked
                        ? 'bg-green-100 text-green-700'
                        : 'bg-orange-100 text-orange-700'
                    }`}>
                      {row.attendanceMarked ? 'Marked' : 'Not marked'}
                    </span>
                  )}

                  {/* Action button */}
                  {row.status !== 'cancelled' && (
                    <Link
                      href={`/teacher/classes/${row.id}/attendance`}
                      className="btn-primary text-xs px-3 py-1.5 flex-shrink-0"
                    >
                      {row.attendanceMarked ? 'Edit' : 'Mark'}
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
