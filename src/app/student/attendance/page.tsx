/**
 * Attendance History — /student/attendance
 *
 * Shows the student's own attendance records with status badges,
 * plus a violation counter summary at the top.
 */

'use client';

import { useEffect, useState } from 'react';
import { useAuthContext } from '@/components/layout/AuthProvider';

interface AttendanceRecord {
  id: string;
  date: string;           // ISO date string
  className: string;
  status: 'present' | 'absent' | 'late' | 'excused' | 'violation';
  notes?: string;
}

interface ViolationSummary {
  total: number;
  consecutive: number;
}

function statusBadgeClass(status: AttendanceRecord['status']): string {
  switch (status) {
    case 'present':   return 'badge badge-success';
    case 'late':      return 'badge badge-warning';
    case 'absent':    return 'badge badge-error';
    case 'violation': return 'badge badge-error';
    case 'excused':   return 'badge badge-info';
    default:          return 'badge badge-neutral';
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      <td className="px-4 py-3"><div className="h-3 w-28 bg-gray-200 rounded" /></td>
      <td className="px-4 py-3"><div className="h-3 w-24 bg-gray-200 rounded" /></td>
      <td className="px-4 py-3"><div className="h-5 w-16 bg-gray-200 rounded-full" /></td>
      <td className="px-4 py-3 hidden sm:table-cell"><div className="h-3 w-32 bg-gray-200 rounded" /></td>
    </tr>
  );
}

export default function AttendanceHistoryPage() {
  const { user, apiFetch } = useAuthContext();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [violations, setViolations] = useState<ViolationSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    Promise.all([
      apiFetch('/api/attendance/mark').then((r) => r.json()),
      apiFetch('/api/payment/proof').then((r) => r.json()),
    ])
      .then(([attendanceData, paymentData]) => {
        setRecords(Array.isArray(attendanceData) ? attendanceData : attendanceData.records ?? []);
        setViolations({
          total: paymentData.totalViolations ?? 0,
          consecutive: paymentData.consecutiveViolations ?? 0,
        });
      })
      .catch((err) => setError(err.message ?? 'Failed to load attendance data.'))
      .finally(() => setLoading(false));
  }, [user, apiFetch]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <h1 className="font-heading text-2xl font-bold text-charcoal">
        Attendance History
      </h1>

      {/* Violation counter */}
      {!loading && violations && (
        <div
          className={`card flex flex-col sm:flex-row sm:items-center gap-4 ${
            violations.consecutive >= 2
              ? 'border-red-300 bg-red-50'
              : 'border-green-200 bg-green-50'
          }`}
        >
          <div className="flex-1">
            <p className="section-title text-base">Violation Summary</p>
            <p className="text-xs text-gray-600 mt-0.5">
              Unexcused absences that affect your standing
            </p>
          </div>
          <div className="flex gap-6 flex-shrink-0">
            <div className="text-center">
              <p className="text-2xl font-bold text-charcoal">
                {violations.total}
              </p>
              <p className="text-xs text-gray-500">Total</p>
            </div>
            <div className="text-center">
              <p
                className={`text-2xl font-bold ${
                  violations.consecutive >= 2
                    ? 'text-red-600'
                    : 'text-green-700'
                }`}
              >
                {violations.consecutive}
              </p>
              <p className="text-xs text-gray-500">Consecutive</p>
            </div>
          </div>
          {violations.consecutive >= 2 && (
            <span className="badge badge-error self-start sm:self-center">
              Action required
            </span>
          )}
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="card border-red-300 bg-red-50 text-red-800 text-sm">
          ⚠️ {error}
        </div>
      )}

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">
                  Date
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">
                  Class
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">
                  Status
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 hidden sm:table-cell">
                  Notes
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <SkeletonRow key={i} />
                  ))
                : records.length === 0
                ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-4 py-12 text-center text-gray-400 text-sm"
                      >
                        No attendance records found yet.
                      </td>
                    </tr>
                  )
                : records.map((rec) => (
                    <tr key={rec.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-charcoal whitespace-nowrap">
                        {formatDate(rec.date)}
                      </td>
                      <td className="px-4 py-3 text-charcoal">
                        {rec.className}
                      </td>
                      <td className="px-4 py-3">
                        <span className={statusBadgeClass(rec.status)}>
                          {rec.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">
                        {rec.notes ?? '—'}
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
