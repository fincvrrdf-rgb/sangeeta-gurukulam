/**
 * Mark Attendance — /teacher/classes/[id]/attendance
 *
 * Lists enrolled students, lets teacher mark each one, then bulk-submits.
 */

'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthContext } from '@/components/layout/AuthProvider';

type AttendanceStatus = 'present' | 'late' | 'absent' | 'did_not_show';

interface StudentBooking {
  bookingId: string;
  studentId: string;
  studentName: string;
  violationCount: number;
}

interface ClassInstanceDetail {
  id: string;
  date: string;
  startTime: string;
  batchBand: string;
  studentCount: number;
}

interface AttendanceDraft {
  bookingId: string;
  studentId: string;
  status: AttendanceStatus;
}

const STATUS_OPTIONS: { value: AttendanceStatus; label: string; color: string }[] = [
  { value: 'present',      label: 'Present',      color: 'border-green-400 bg-green-50 text-green-800' },
  { value: 'late',         label: 'Late',          color: 'border-yellow-400 bg-yellow-50 text-yellow-800' },
  { value: 'absent',       label: 'Absent',        color: 'border-red-400 bg-red-50 text-red-800' },
  { value: 'did_not_show', label: 'Did Not Show',  color: 'border-gray-400 bg-gray-50 text-gray-700' },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function SkeletonStudentRow() {
  return (
    <div className="card animate-pulse space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-gray-200 flex-shrink-0" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3 w-32 bg-gray-200 rounded" />
          <div className="h-2.5 w-20 bg-gray-200 rounded" />
        </div>
      </div>
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-8 flex-1 bg-gray-200 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

export default function MarkAttendancePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, apiFetch } = useAuthContext();

  const [classDetail, setClassDetail] = useState<ClassInstanceDetail | null>(null);
  const [students, setStudents] = useState<StudentBooking[]>([]);
  const [drafts, setDrafts] = useState<Record<string, AttendanceStatus>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!user || !id) return;
    Promise.all([
      apiFetch(`/api/classes/instances/${id}`).then((r) => r.json()),
      apiFetch(`/api/classes/instances/${id}/bookings`).then((r) => r.json()),
    ])
      .then(([detail, bookingsData]) => {
        setClassDetail(detail);
        const bookings: StudentBooking[] = Array.isArray(bookingsData)
          ? bookingsData
          : bookingsData.bookings ?? [];
        setStudents(bookings);
        // Default everyone to 'present'
        const initialDrafts: Record<string, AttendanceStatus> = {};
        for (const b of bookings) {
          initialDrafts[b.studentId] = 'present';
        }
        setDrafts(initialDrafts);
      })
      .catch((err) => setError(err.message ?? 'Failed to load class data.'))
      .finally(() => setLoading(false));
  }, [user, id, apiFetch]);

  function setStatus(studentId: string, status: AttendanceStatus) {
    setDrafts((prev) => ({ ...prev, [studentId]: status }));
  }

  function markAll(status: AttendanceStatus) {
    const all: Record<string, AttendanceStatus> = {};
    for (const s of students) all[s.studentId] = status;
    setDrafts(all);
  }

  const allMarked = students.length > 0 && students.every((s) => drafts[s.studentId]);
  const presentCount = Object.values(drafts).filter((s) => s === 'present').length;

  async function handleSubmit() {
    setSubmitError(null);
    setSubmitting(true);
    try {
      const records = students.map((s) => ({
        bookingId: s.bookingId,
        studentId: s.studentId,
        classInstanceId: id,
        status: drafts[s.studentId] ?? 'absent',
      }));

      const res = await apiFetch('/api/attendance/mark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? 'Submission failed');
      }

      setSubmitted(true);
      setTimeout(() => router.push('/teacher/classes'), 1500);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Could not submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center space-y-4">
        <span className="text-5xl">✅</span>
        <h2 className="font-heading text-xl font-semibold text-charcoal">
          Attendance Submitted
        </h2>
        <p className="text-sm text-gray-500">Redirecting to classes…</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link href="/teacher/classes" className="text-gray-400 hover:text-gray-600 mt-1">
          ← Back
        </Link>
        <div>
          <h1 className="font-heading text-2xl font-bold text-charcoal">Mark Attendance</h1>
          {classDetail && (
            <p className="text-sm text-gray-500 mt-0.5">
              {formatDate(classDetail.date)} · {classDetail.startTime} · Batch {classDetail.batchBand}
            </p>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="card border-red-300 bg-red-50 text-red-800 text-sm">
          ⚠️ {error}
        </div>
      )}

      {/* Bulk actions */}
      {!loading && students.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500 font-medium mr-1">Mark all:</span>
          {STATUS_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => markAll(value)}
              className="btn-secondary text-xs px-3 py-1.5"
            >
              {label}
            </button>
          ))}
          <span className="ml-auto text-xs text-gray-500">
            {presentCount} / {students.length} present
          </span>
        </div>
      )}

      {/* Student list */}
      <div className="space-y-3">
        {loading
          ? Array.from({ length: 5 }).map((_, i) => <SkeletonStudentRow key={i} />)
          : students.length === 0
          ? (
            <div className="card flex flex-col items-center py-12 text-center">
              <span className="text-3xl mb-2">👥</span>
              <p className="text-gray-500 text-sm">No students enrolled in this class.</p>
            </div>
          )
          : students.map((student) => (
            <div key={student.studentId} className="card space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-saffron-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-saffron-700">
                    {student.studentName.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-charcoal">{student.studentName}</p>
                  <p className="text-xs text-gray-500">
                    {student.violationCount} violation{student.violationCount !== 1 ? 's' : ''}
                  </p>
                </div>
                {student.violationCount >= 2 && (
                  <span className="badge badge-warning">⚠️ {student.violationCount} violations</span>
                )}
              </div>

              {/* Radio buttons */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {STATUS_OPTIONS.map(({ value, label, color }) => {
                  const selected = drafts[student.studentId] === value;
                  return (
                    <label
                      key={value}
                      className={`flex items-center justify-center gap-1.5 border-2 rounded-lg px-3 py-2 cursor-pointer text-xs font-medium transition-all ${
                        selected
                          ? color
                          : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name={`status-${student.studentId}`}
                        value={value}
                        checked={selected}
                        onChange={() => setStatus(student.studentId, value)}
                        className="sr-only"
                      />
                      {label}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
      </div>

      {/* Submit error */}
      {submitError && (
        <div className="card border-red-300 bg-red-50 text-red-800 text-sm">
          ⚠️ {submitError}
        </div>
      )}

      {/* Submit button */}
      {!loading && students.length > 0 && (
        <div className="flex items-center justify-end gap-3 pt-2">
          <Link href="/teacher/classes" className="btn-secondary">
            Cancel
          </Link>
          <button
            onClick={handleSubmit}
            disabled={submitting || !allMarked}
            className="btn-primary disabled:opacity-50"
          >
            {submitting ? 'Submitting…' : `Submit Attendance (${students.length})`}
          </button>
        </div>
      )}
    </div>
  );
}
