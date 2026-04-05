/**
 * Weekly Reports List — /teacher/reports
 *
 * Lists generated weekly reports with status badges.
 * Allows generating reports for the current week.
 */

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuthContext } from '@/components/layout/AuthProvider';

type ReportStatus = 'ai_draft' | 'published';

interface Report {
  id: string;
  weekStartDate: string; // ISO date string (Monday)
  status: ReportStatus;
  studentCount: number;
}

function statusBadgeClass(status: ReportStatus): string {
  return status === 'published' ? 'badge badge-success' : 'badge badge-info';
}

function statusLabel(status: ReportStatus): string {
  return status === 'published' ? 'Published' : 'AI Draft';
}

function formatWeek(isoDate: string): string {
  const start = new Date(isoDate);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  return `${fmt(start)} – ${fmt(end)}, ${start.getFullYear()}`;
}

/** Returns the ISO date string for this Monday (yyyy-mm-dd). */
function thisMonday(): string {
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  return monday.toISOString().split('T')[0];
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 px-5 py-4 animate-pulse">
      <div className="flex-1 space-y-1.5">
        <div className="h-3 w-44 bg-gray-200 rounded" />
        <div className="h-2.5 w-28 bg-gray-200 rounded" />
      </div>
      <div className="h-5 w-20 bg-gray-200 rounded-full" />
    </div>
  );
}

export default function ReportsListPage() {
  const { user, apiFetch } = useAuthContext();

  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  function flash(msg: string) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3500);
  }

  function loadReports() {
    return apiFetch('/api/reports')
      .then((r) => r.json())
      .then((data) => setReports(Array.isArray(data) ? data : data.reports ?? []));
  }

  useEffect(() => {
    if (!user) return;
    loadReports()
      .catch((err) => setError(err.message ?? 'Failed to load reports.'))
      .finally(() => setLoading(false));
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleDelete(id: string) {
    if (!confirm('Delete this report? This cannot be undone.')) return;
    setDeleting(id);
    setError(null);
    try {
      const res = await apiFetch(`/api/reports/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Error ${res.status}`);
      }
      setReports((prev) => prev.filter((r) => r.id !== id));
      flash('Report deleted.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete report.');
    } finally {
      setDeleting(null);
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const weekStartDate = thisMonday();
      const res = await apiFetch('/api/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekStartDate }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Error ${res.status}`);
      }
      flash('Reports generated for this week.');
      await loadReports();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to generate reports.');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-charcoal">Weekly Reports</h1>
          <p className="text-sm text-gray-500 mt-0.5">AI-generated student progress reports</p>
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="btn-primary"
        >
          {generating ? 'Generating…' : '⚡ Generate This Week'}
        </button>
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

      {/* AI Draft Notice */}
      <div className="flex items-start gap-2 rounded-xl border border-yellow-300 bg-yellow-50 px-4 py-3">
        <span className="text-base flex-shrink-0">⚠️</span>
        <p className="text-sm text-yellow-800">
          Reports are <strong>AI-generated drafts</strong>. Review and edit each report before publishing to students.
        </p>
      </div>

      {/* List */}
      {loading ? (
        <div className="card p-0 divide-y divide-gray-100">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} />)}
        </div>
      ) : reports.length === 0 ? (
        <div className="card flex flex-col items-center py-16 text-center">
          <span className="text-4xl mb-3">📊</span>
          <p className="text-gray-600 font-medium">No reports yet</p>
          <p className="text-gray-400 text-sm mt-1">
            Generate reports for the current week to get started.
          </p>
          <button onClick={handleGenerate} disabled={generating} className="btn-primary mt-4">
            {generating ? 'Generating…' : 'Generate This Week'}
          </button>
        </div>
      ) : (
        <div className="card p-0 divide-y divide-gray-100">
          {/* Column headers */}
          <div className="hidden sm:grid grid-cols-[1fr_auto_auto_auto] gap-4 px-5 py-3 bg-gray-50 rounded-t-xl">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Week</span>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Students</span>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</span>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Action</span>
          </div>

          {reports.map((report) => (
            <div key={report.id} className="flex items-center gap-4 px-5 py-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-charcoal">{formatWeek(report.weekStartDate)}</p>
                {/* Mobile */}
                <div className="flex items-center gap-2 mt-1 sm:hidden">
                  <span className="text-xs text-gray-500">{report.studentCount} student{report.studentCount !== 1 ? 's' : ''}</span>
                  <span className={statusBadgeClass(report.status)}>{statusLabel(report.status)}</span>
                </div>
              </div>
              <p className="hidden sm:block text-sm text-gray-500 w-16 flex-shrink-0 text-center">
                {report.studentCount}
              </p>
              <span className={`hidden sm:inline-flex ${statusBadgeClass(report.status)}`}>
                {statusLabel(report.status)}
              </span>
              <Link
                href={`/teacher/reports/${report.id}`}
                className="btn-secondary text-xs flex-shrink-0"
              >
                View
              </Link>
              {report.status !== 'published' && (
                <button
                  onClick={() => handleDelete(report.id)}
                  disabled={deleting === report.id}
                  className="text-xs text-red-500 hover:text-red-700 transition-colors disabled:opacity-50 flex-shrink-0"
                >
                  {deleting === report.id ? '…' : 'Delete'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
