/**
 * Practice Recording History — /student/practice/history
 *
 * Lists all of the student's past practice recordings.
 * Shows unit name, date, status badge, and teacher feedback for reviewed recordings.
 * Fetches from GET /api/recordings.
 */

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuthContext } from '@/components/layout/AuthProvider';

interface Recording {
  id: string;
  teachingUnitId: string;
  teachingUnitName?: string;
  fileName: string;
  mimeType: string;
  durationSeconds: number;
  status: 'draft' | 'submitted' | 'reviewed';
  submittedAt: string | null;
  createdAt: string;
  // Review fields (present when status === 'reviewed')
  reviewStatus?: 'accepted' | 'needs_improvement' | 'incomplete';
  reviewFeedback?: string | null;
  reviewScore?: number | null;
  lastReviewedAt?: string | null;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function StatusBadge({ status }: { status: Recording['status'] }) {
  if (status === 'submitted') {
    return <span className="badge badge-warning">Submitted</span>;
  }
  if (status === 'reviewed') {
    return <span className="badge badge-success">Reviewed</span>;
  }
  return <span className="badge badge-neutral">Draft</span>;
}

function ReviewStatusBadge({
  reviewStatus,
}: {
  reviewStatus: Recording['reviewStatus'];
}) {
  if (!reviewStatus) return null;
  if (reviewStatus === 'accepted') {
    return <span className="badge badge-success">Accepted</span>;
  }
  if (reviewStatus === 'needs_improvement') {
    return <span className="badge badge-warning">Needs Improvement</span>;
  }
  return <span className="badge badge-error">Incomplete</span>;
}

function SkeletonRow() {
  return (
    <li className="card animate-pulse flex flex-col gap-3 p-4">
      <div className="flex justify-between">
        <div className="h-4 w-40 bg-gray-200 rounded" />
        <div className="h-5 w-16 bg-gray-200 rounded-full" />
      </div>
      <div className="h-3 w-24 bg-gray-200 rounded" />
    </li>
  );
}

export default function PracticeHistoryPage() {
  const { user, apiFetch } = useAuthContext();

  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    apiFetch('/api/recordings')
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load recordings (${r.status})`);
        return r.json();
      })
      .then((data) => {
        setRecordings(Array.isArray(data) ? data : data.recordings ?? []);
      })
      .catch((err) => setError(err.message ?? 'Could not load recordings.'))
      .finally(() => setLoading(false));
  }, [user, apiFetch]);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-charcoal">
            Practice Recordings
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Your submitted recordings and teacher feedback.
          </p>
        </div>
        <Link href="/student/practice/record" className="btn-primary text-sm">
          + New Recording
        </Link>
      </div>

      {/* Error */}
      {error && (
        <div className="card border-red-300 bg-red-50 text-sm text-red-800">
          &#9888;&#65039; {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <ul className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </ul>
      )}

      {/* Empty state */}
      {!loading && !error && recordings.length === 0 && (
        <div className="card text-center py-16 space-y-3">
          <p className="text-3xl">&#x1F3A4;</p>
          <p className="font-semibold text-charcoal">No recordings yet</p>
          <p className="text-sm text-gray-500 max-w-xs mx-auto">
            Start your first practice recording and submit it for teacher feedback.
          </p>
          <Link href="/student/practice/record" className="btn-primary inline-flex mt-2">
            Record Now
          </Link>
        </div>
      )}

      {/* Recording list */}
      {!loading && recordings.length > 0 && (
        <ul className="space-y-3">
          {recordings.map((rec) => (
            <li key={rec.id} className="card space-y-3">
              {/* Top row */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-charcoal text-sm truncate">
                    {rec.teachingUnitName ?? rec.teachingUnitId}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {rec.submittedAt
                      ? `Submitted ${formatDate(rec.submittedAt)}`
                      : `Created ${formatDate(rec.createdAt)}`}
                    {' \u2022 '}
                    {formatDuration(rec.durationSeconds)}
                  </p>
                </div>
                <StatusBadge status={rec.status} />
              </div>

              {/* Review section */}
              {rec.status === 'reviewed' && (
                <div className="rounded-lg border border-green-200 bg-green-50 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-green-800 uppercase tracking-wide">
                      Teacher Feedback
                    </p>
                    <div className="flex items-center gap-2">
                      {rec.reviewScore != null && (
                        <span className="text-xs font-bold text-green-700">
                          Score: {rec.reviewScore}
                        </span>
                      )}
                      <ReviewStatusBadge reviewStatus={rec.reviewStatus} />
                    </div>
                  </div>
                  {rec.reviewFeedback ? (
                    <p className="text-sm text-green-900 leading-relaxed">
                      {rec.reviewFeedback}
                    </p>
                  ) : (
                    <p className="text-xs text-green-700 italic">
                      No written feedback provided.
                    </p>
                  )}
                  {rec.lastReviewedAt && (
                    <p className="text-xs text-green-600">
                      Reviewed {formatDate(rec.lastReviewedAt)}
                    </p>
                  )}
                </div>
              )}

              {/* Pending review note */}
              {rec.status === 'submitted' && (
                <p className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-1.5">
                  &#8987; Awaiting teacher review
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
