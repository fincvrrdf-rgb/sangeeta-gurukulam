/**
 * Assessment List — /teacher/assessments
 *
 * Lists recent lesson assessments with student, unit, result, and date.
 * Links to create a new assessment.
 */

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuthContext } from '@/components/layout/AuthProvider';

type AssessmentType = 'formative' | 'testing_day' | 'makeup';
type AssessmentResult = 'pass' | 'fail' | 'pending';

interface Assessment {
  id: string;
  studentId: string;
  studentName: string;
  teachingUnitName: string;
  assessmentType: AssessmentType;
  totalScore: number;
  maxScore: number;
  result: AssessmentResult;
  createdAt: string;
}

function resultBadge(result: AssessmentResult): string {
  switch (result) {
    case 'pass':    return 'badge badge-success';
    case 'fail':    return 'badge badge-error';
    case 'pending': return 'badge badge-neutral';
    default:        return 'badge badge-neutral';
  }
}

function typeBadge(type: AssessmentType): string {
  switch (type) {
    case 'formative':    return 'badge badge-info';
    case 'testing_day':  return 'badge bg-purple-100 text-purple-800';
    case 'makeup':       return 'badge bg-orange-100 text-orange-800';
    default:             return 'badge badge-neutral';
  }
}

function typeLabel(type: AssessmentType): string {
  switch (type) {
    case 'formative':   return 'Formative';
    case 'testing_day': return 'Testing Day';
    case 'makeup':      return 'Makeup';
    default:            return type;
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function percentColor(pct: number): string {
  if (pct >= 60) return 'text-green-700';
  if (pct >= 40) return 'text-yellow-700';
  return 'text-red-700';
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 px-5 py-4 animate-pulse">
      <div className="w-9 h-9 rounded-full bg-gray-200 flex-shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3 w-36 bg-gray-200 rounded" />
        <div className="h-2.5 w-24 bg-gray-200 rounded" />
      </div>
      <div className="h-5 w-14 bg-gray-200 rounded-full" />
      <div className="h-5 w-12 bg-gray-200 rounded-full" />
    </div>
  );
}

export default function AssessmentListPage() {
  const { user, apiFetch } = useAuthContext();

  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function handleDelete(id: string) {
    if (!confirm('Delete this assessment? This cannot be undone.')) return;
    setDeleting(id);
    setError(null);
    try {
      const res = await apiFetch(`/api/assessments/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Error ${res.status}`);
      }
      setAssessments((prev) => prev.filter((a) => a.id !== id));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete assessment.');
    } finally {
      setDeleting(null);
    }
  }

  useEffect(() => {
    if (!user) return;
    apiFetch('/api/assessments')
      .then((r) => r.json())
      .then((data) => setAssessments(Array.isArray(data) ? data : data.assessments ?? []))
      .catch((err) => setError(err.message ?? 'Failed to load assessments.'))
      .finally(() => setLoading(false));
  }, [user, apiFetch]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-charcoal">Assessments</h1>
          <p className="text-sm text-gray-500 mt-0.5">Recent student evaluations</p>
        </div>
        <Link href="/teacher/assessments/new" className="btn-primary">
          + New
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
      ) : assessments.length === 0 ? (
        <div className="card flex flex-col items-center py-16 text-center">
          <span className="text-4xl mb-3">📊</span>
          <p className="text-gray-600 font-medium">No assessments yet</p>
          <p className="text-gray-400 text-sm mt-1">Create the first one to start tracking student progress.</p>
          <Link href="/teacher/assessments/new" className="btn-primary mt-4">
            Create Assessment
          </Link>
        </div>
      ) : (
        <div className="card p-0 divide-y divide-gray-100">
          {/* Column headers */}
          <div className="hidden sm:grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-4 px-5 py-3 bg-gray-50 rounded-t-xl">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Student / Unit</span>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</span>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Score</span>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Result</span>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</span>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider"></span>
          </div>

          {assessments.map((a) => {
            const pct = Math.round((a.totalScore / a.maxScore) * 100);
            return (
              <div key={a.id} className="flex items-center gap-4 px-5 py-4">
                {/* Avatar */}
                <div className="w-9 h-9 rounded-full bg-saffron-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-saffron-700">
                    {a.studentName.charAt(0).toUpperCase()}
                  </span>
                </div>

                {/* Student + Unit */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-charcoal truncate">{a.studentName}</p>
                  <p className="text-xs text-gray-500 truncate">{a.teachingUnitName}</p>
                  {/* Mobile: type + date inline */}
                  <div className="flex items-center gap-2 mt-1 sm:hidden">
                    <span className={typeBadge(a.assessmentType)}>{typeLabel(a.assessmentType)}</span>
                    <span className="text-xs text-gray-400">{formatDate(a.createdAt)}</span>
                  </div>
                </div>

                {/* Type (sm+) */}
                <span className={`hidden sm:inline-flex ${typeBadge(a.assessmentType)}`}>
                  {typeLabel(a.assessmentType)}
                </span>

                {/* Score */}
                <div className="flex-shrink-0 text-right">
                  <p className={`text-sm font-semibold ${percentColor(pct)}`}>
                    {a.totalScore}/{a.maxScore}
                  </p>
                  <p className="text-xs text-gray-400">{pct}%</p>
                </div>

                {/* Result */}
                <span className={resultBadge(a.result)}>{a.result}</span>

                {/* Date (sm+) */}
                <p className="hidden sm:block text-xs text-gray-500 w-20 flex-shrink-0 text-right">
                  {formatDate(a.createdAt)}
                </p>

                {/* Delete */}
                <button
                  onClick={() => handleDelete(a.id)}
                  disabled={deleting === a.id}
                  className="text-xs text-red-500 hover:text-red-700 transition-colors disabled:opacity-50 flex-shrink-0"
                >
                  {deleting === a.id ? '…' : 'Delete'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
