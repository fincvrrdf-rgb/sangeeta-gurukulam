/**
 * Weekly Reports List — /student/reports
 *
 * Shows all published weekly reports for the student.
 * Fetches from Firestore directly (published reports for the current user).
 * Displays week, AI feedback snippet, and links to the detail page.
 */

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  collection,
  query,
  where,
  getDocs,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { COLLECTIONS } from '@/domain/constants';
import { useAuthContext } from '@/components/layout/AuthProvider';

interface ReportSummary {
  id: string;
  weekOf: string;        // 'YYYY-WW'
  aiSummary: string;
  teacherRemarks: string;
  strengths: string[];
  weakAreas: string[];
  publishedAt: string | null;
  status: string;
}

/** Convert YYYY-WW to a human-readable range label */
function weekLabel(weekOf: string): string {
  try {
    const [year, week] = weekOf.split('-').map(Number);
    // Get the Monday of that ISO week
    const jan4 = new Date(year, 0, 4);
    const monday = new Date(
      jan4.getTime() +
        (week - 1) * 7 * 86_400_000 -
        ((jan4.getDay() || 7) - 1) * 86_400_000,
    );
    const sunday = new Date(monday.getTime() + 6 * 86_400_000);
    const fmt = (d: Date) =>
      d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    return `${fmt(monday)} – ${fmt(sunday)}, ${year}`;
  } catch {
    return weekOf;
  }
}

function truncate(text: string, max = 120): string {
  if (!text) return '';
  return text.length > max ? text.slice(0, max).trimEnd() + '…' : text;
}

function SkeletonCard() {
  return (
    <div className="card animate-pulse space-y-3">
      <div className="h-4 w-48 bg-gray-200 rounded" />
      <div className="h-3 w-full bg-gray-200 rounded" />
      <div className="h-3 w-3/4 bg-gray-200 rounded" />
    </div>
  );
}

export default function WeeklyReportsPage() {
  const { user } = useAuthContext();

  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    async function load() {
      try {
        const q = query(
          collection(db, COLLECTIONS.WEEKLY_REPORTS),
          where('studentId', '==', user!.uid),
          where('status', '==', 'published'),
        );
        const snap = await getDocs(q);
        const items: ReportSummary[] = snap.docs.map((doc) => ({
          id: doc.id,
          ...(doc.data() as Omit<ReportSummary, 'id'>),
        }));
        // Sort client-side to avoid composite index requirement
        items.sort((a, b) => (b.weekOf ?? '').localeCompare(a.weekOf ?? ''));
        setReports(items);
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : 'Could not load reports.',
        );
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [user]);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-heading text-2xl font-bold text-charcoal">
          Weekly Reports
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Teacher-published summaries of your weekly progress.
        </p>
      </div>

      {/* AI disclaimer */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex gap-2 text-xs text-amber-800">
        <span className="flex-shrink-0 mt-0.5">&#x1F916;</span>
        <span>
          Reports include AI-generated feedback. This is an assistive tool —
          your teacher reviews and approves all content before publishing.
        </span>
      </div>

      {/* Error */}
      {error && (
        <div className="card border-red-300 bg-red-50 text-sm text-red-800">
          &#9888;&#65039; {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && reports.length === 0 && (
        <div className="card text-center py-16 space-y-3">
          <p className="text-3xl">&#x1F4C4;</p>
          <p className="font-semibold text-charcoal">No reports yet</p>
          <p className="text-sm text-gray-500 max-w-xs mx-auto">
            Your teacher will publish weekly progress reports here. Check back after your next class.
          </p>
        </div>
      )}

      {/* Report cards */}
      {!loading && reports.length > 0 && (
        <div className="space-y-3">
          {reports.map((report) => (
            <Link
              key={report.id}
              href={`/student/reports/${report.id}`}
              className="card block hover:border-saffron-300 hover:shadow-md transition-all duration-150 space-y-3"
            >
              {/* Week label */}
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-charcoal text-sm">
                    Week of {weekLabel(report.weekOf)}
                  </p>
                  {report.publishedAt && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      Published{' '}
                      {new Date(report.publishedAt).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </p>
                  )}
                </div>
                <span className="text-saffron-500 flex-shrink-0 text-lg">&#x2192;</span>
              </div>

              {/* AI summary snippet */}
              {report.aiSummary && (
                <p className="text-sm text-gray-600 leading-relaxed">
                  {truncate(report.aiSummary)}
                </p>
              )}

              {/* Strengths / weak areas chips */}
              {(report.strengths?.length > 0 || report.weakAreas?.length > 0) && (
                <div className="flex flex-wrap gap-1.5">
                  {(report.strengths ?? []).slice(0, 2).map((s, i) => (
                    <span key={i} className="badge badge-success text-xs">
                      &#x2714; {s}
                    </span>
                  ))}
                  {(report.weakAreas ?? []).slice(0, 2).map((w, i) => (
                    <span key={i} className="badge badge-warning text-xs">
                      &#x26A0; {w}
                    </span>
                  ))}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
