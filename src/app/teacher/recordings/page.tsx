/**
 * Recording Review List — /teacher/recordings
 *
 * Shows all student recordings with status filter.
 * Links to individual review pages.
 */

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuthContext } from '@/components/layout/AuthProvider';

type RecordingStatus = 'submitted' | 'reviewed';

interface Recording {
  id: string;
  studentName: string;
  unitName: string;
  submittedAt: string;
  status: RecordingStatus;
}

type FilterValue = 'all' | RecordingStatus;

const FILTERS: { label: string; value: FilterValue }[] = [
  { label: 'All', value: 'all' },
  { label: 'Submitted', value: 'submitted' },
  { label: 'Reviewed', value: 'reviewed' },
];

function statusBadgeClass(status: RecordingStatus): string {
  return status === 'reviewed' ? 'badge badge-success' : 'badge badge-warning';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 px-5 py-4 animate-pulse">
      <div className="flex-1 space-y-1.5">
        <div className="h-3 w-36 bg-gray-200 rounded" />
        <div className="h-2.5 w-28 bg-gray-200 rounded" />
      </div>
      <div className="h-5 w-20 bg-gray-200 rounded-full" />
      <div className="h-3 w-20 bg-gray-200 rounded" />
    </div>
  );
}

export default function RecordingsListPage() {
  const { user, apiFetch } = useAuthContext();

  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterValue>('all');

  useEffect(() => {
    if (!user) return;
    apiFetch('/api/recordings')
      .then((r) => r.json())
      .then((data) => setRecordings(Array.isArray(data) ? data : data.recordings ?? []))
      .catch((err) => setError(err.message ?? 'Failed to load recordings.'))
      .finally(() => setLoading(false));
  }, [user, apiFetch]);

  const filtered =
    filter === 'all' ? recordings : recordings.filter((r) => r.status === filter);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-heading text-2xl font-bold text-charcoal">Recordings</h1>
        <p className="text-sm text-gray-500 mt-0.5">Review student practice recordings</p>
      </div>

      {/* Error */}
      {error && (
        <div className="card border-red-300 bg-red-50 text-red-800 text-sm flex items-start justify-between gap-2">
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)} className="flex-shrink-0 text-red-500 hover:text-red-700 font-bold">×</button>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              filter === f.value
                ? 'bg-white text-saffron-700 shadow-sm'
                : 'text-gray-500 hover:text-charcoal'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="card p-0 divide-y divide-gray-100">
          {Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card flex flex-col items-center py-16 text-center">
          <span className="text-4xl mb-3">🎙️</span>
          <p className="text-gray-600 font-medium">
            {filter === 'all' ? 'No recordings yet' : `No ${filter} recordings`}
          </p>
          <p className="text-gray-400 text-sm mt-1">
            Student recordings will appear here once submitted.
          </p>
        </div>
      ) : (
        <div className="card p-0 divide-y divide-gray-100">
          {/* Column headers */}
          <div className="hidden sm:grid grid-cols-[1fr_auto_auto_auto] gap-4 px-5 py-3 bg-gray-50 rounded-t-xl">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Student / Unit</span>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</span>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Submitted</span>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Action</span>
          </div>

          {filtered.map((rec) => (
            <div key={rec.id} className="flex items-center gap-4 px-5 py-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-charcoal truncate">{rec.studentName}</p>
                <p className="text-xs text-gray-500 truncate">{rec.unitName}</p>
                {/* Mobile: status + date */}
                <div className="flex items-center gap-2 mt-1 sm:hidden">
                  <span className={statusBadgeClass(rec.status)}>{rec.status}</span>
                  <span className="text-xs text-gray-400">{formatDate(rec.submittedAt)}</span>
                </div>
              </div>
              <span className={`hidden sm:inline-flex ${statusBadgeClass(rec.status)}`}>
                {rec.status}
              </span>
              <p className="hidden sm:block text-xs text-gray-500 w-24 flex-shrink-0 text-right">
                {formatDate(rec.submittedAt)}
              </p>
              <Link
                href={`/teacher/recordings/${rec.id}`}
                className="btn-secondary text-xs flex-shrink-0"
              >
                Review
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
