/**
 * Report Detail + Publish — /teacher/reports/[id]
 *
 * Shows the AI-generated weekly report draft with editable feedback.
 * Allows publishing to the student after review.
 * AI disclaimer is always visible.
 */

'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthContext } from '@/components/layout/AuthProvider';

interface AttendanceSummary {
  present: number;
  absent: number;
  total: number;
}

interface PracticeSummary {
  recordingsSubmitted: number;
  averagePitchScore: number | null;
  averageRhythmScore: number | null;
}

interface ReportDetail {
  id: string;
  studentName: string;
  weekStartDate: string;
  status: 'ai_draft' | 'published';
  aiFeedback: string;
  attendance: AttendanceSummary;
  practice: PracticeSummary;
}

function formatWeek(isoDate: string): string {
  const start = new Date(isoDate);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  return `${fmt(start)} – ${fmt(end)}, ${start.getFullYear()}`;
}

export default function ReportDetailPage() {
  const { user, apiFetch } = useAuthContext();
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [report, setReport] = useState<ReportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [editedFeedback, setEditedFeedback] = useState('');
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    if (!user) return;
    apiFetch(`/api/reports/${id}`)
      .then((r) => r.json())
      .then((data: ReportDetail) => {
        setReport(data);
        setEditedFeedback(data.aiFeedback ?? '');
      })
      .catch((err) => setError(err.message ?? 'Failed to load report.'))
      .finally(() => setLoading(false));
  }, [user, apiFetch, id]);

  function flash(msg: string) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3500);
  }

  async function handlePublish(e: FormEvent) {
    e.preventDefault();
    if (!confirm('Publish this report to the student? They will be notified.')) return;
    setPublishing(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/reports/${id}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback: editedFeedback }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Error ${res.status}`);
      }
      setReport((prev) => prev ? { ...prev, status: 'published' } : prev);
      flash('Report published to student.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to publish report.');
    } finally {
      setPublishing(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
        <div className="h-7 w-52 bg-gray-200 rounded animate-pulse" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card animate-pulse space-y-3">
            <div className="h-4 w-32 bg-gray-200 rounded" />
            <div className="h-3 w-full bg-gray-200 rounded" />
            <div className="h-3 w-3/4 bg-gray-200 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (!report) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="card text-center py-16 text-gray-500">
          <p>Report not found.</p>
          <button onClick={() => router.back()} className="btn-secondary mt-4">Go Back</button>
        </div>
      </div>
    );
  }

  const isPublished = report.status === 'published';

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-heading text-2xl font-bold text-charcoal">
            {report.studentName}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-2">
            {formatWeek(report.weekStartDate)}
            <span className={`badge ${isPublished ? 'badge-success' : 'badge-info'}`}>
              {isPublished ? 'Published' : 'AI Draft'}
            </span>
          </p>
        </div>
        <button onClick={() => router.back()} className="btn-secondary text-sm flex-shrink-0">
          ← Back
        </button>
      </div>

      {/* Persistent AI Disclaimer — always visible */}
      <div className="flex items-start gap-2 rounded-xl border border-yellow-300 bg-yellow-50 px-4 py-3">
        <span className="text-base flex-shrink-0">⚠️</span>
        <div>
          <p className="text-sm font-semibold text-yellow-800">AI Generated — review before publishing</p>
          <p className="text-xs text-yellow-700 mt-0.5">
            This report was drafted by AI based on attendance and practice data. Verify accuracy and edit as needed before sharing with the student.
          </p>
        </div>
      </div>

      {/* Messages */}
      {successMsg && (
        <div className="card border-green-300 bg-green-50 text-green-800 text-sm">
          ✅ {successMsg}
        </div>
      )}
      {error && (
        <div className="card border-red-300 bg-red-50 text-red-800 text-sm flex items-start justify-between gap-2">
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)} className="flex-shrink-0 text-red-500 hover:text-red-700 font-bold">×</button>
        </div>
      )}

      {/* Attendance Summary */}
      <div className="card space-y-3">
        <h2 className="section-title">Attendance Summary</h2>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-lg bg-green-50 border border-green-200 p-3">
            <p className="text-2xl font-bold text-green-700">{report.attendance.present}</p>
            <p className="text-xs text-green-600 mt-0.5">Present</p>
          </div>
          <div className="rounded-lg bg-red-50 border border-red-200 p-3">
            <p className="text-2xl font-bold text-red-600">{report.attendance.absent}</p>
            <p className="text-xs text-red-500 mt-0.5">Absent</p>
          </div>
          <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
            <p className="text-2xl font-bold text-charcoal">{report.attendance.total}</p>
            <p className="text-xs text-gray-500 mt-0.5">Total</p>
          </div>
        </div>
      </div>

      {/* Practice Summary */}
      <div className="card space-y-3">
        <h2 className="section-title">Practice Summary</h2>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-lg bg-teal-50 border border-teal-200 p-3">
            <p className="text-2xl font-bold text-teal-700">{report.practice.recordingsSubmitted}</p>
            <p className="text-xs text-teal-600 mt-0.5">Recordings</p>
          </div>
          <div className="rounded-lg bg-saffron-50 border border-saffron-200 p-3">
            <p className="text-2xl font-bold text-saffron-700">
              {report.practice.averagePitchScore != null
                ? report.practice.averagePitchScore.toFixed(1)
                : '—'}
            </p>
            <p className="text-xs text-saffron-600 mt-0.5">Avg Pitch</p>
          </div>
          <div className="rounded-lg bg-saffron-50 border border-saffron-200 p-3">
            <p className="text-2xl font-bold text-saffron-700">
              {report.practice.averageRhythmScore != null
                ? report.practice.averageRhythmScore.toFixed(1)
                : '—'}
            </p>
            <p className="text-xs text-saffron-600 mt-0.5">Avg Rhythm</p>
          </div>
        </div>
      </div>

      {/* Feedback Editor */}
      <form onSubmit={handlePublish} className="card space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="section-title">Feedback</h2>
          <span className="badge bg-yellow-100 text-yellow-800">AI Generated</span>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-700">
            {isPublished ? 'Published feedback' : 'Edit feedback before publishing'}
          </label>
          <textarea
            rows={6}
            value={editedFeedback}
            onChange={(e) => setEditedFeedback(e.target.value)}
            placeholder="AI feedback will appear here..."
            className={`input resize-y ${isPublished ? 'bg-gray-50 text-gray-600' : ''}`}
            readOnly={isPublished}
          />
        </div>

        {/* Always-visible disclaimer */}
        <p className="text-xs text-yellow-700 flex items-center gap-1">
          <span>⚠️</span>
          <span>AI draft — always review before publishing to student</span>
        </p>

        {!isPublished && (
          <div className="flex justify-end">
            <button type="submit" disabled={publishing} className="btn-primary">
              {publishing ? 'Publishing…' : '📤 Publish to Student'}
            </button>
          </div>
        )}

        {isPublished && (
          <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
            ✅ This report has been published and the student has been notified.
          </div>
        )}
      </form>
    </div>
  );
}
