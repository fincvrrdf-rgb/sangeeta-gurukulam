/**
 * Weekly Report Detail — /student/reports/[id]
 *
 * Shows the full published weekly report:
 * week range, AI summary, improvement advice, attendance, practice songs,
 * strengths/weak areas, and teacher remarks.
 *
 * Fetches directly from Firestore. Shows "AI-generated" disclaimer.
 */

'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { COLLECTIONS } from '@/domain/constants';
import { useAuthContext } from '@/components/layout/AuthProvider';

interface WeeklyReportDetail {
  id: string;
  studentId: string;
  weekOf: string;                          // 'YYYY-WW'
  lessonsCovered: Array<{
    lessonId: string;
    teachingUnitId: string;
    summary: string;
  }>;
  practiceSongs: string[];
  lyricsToRevise: string[];
  weakAreas: string[];
  strengths: string[];
  readinessForNext: boolean;
  requiredRecordingBeforeNextClass: string;
  teacherRemarks: string;
  aiSummary: string;
  aiImprovementAdvice: string;
  status: 'ai_draft' | 'teacher_reviewed' | 'published';
  publishedAt: string | null;
  publishedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Convert YYYY-WW to a human-readable week range */
function weekRange(weekOf: string): string {
  try {
    const [year, week] = weekOf.split('-').map(Number);
    const jan4 = new Date(year, 0, 4);
    const monday = new Date(
      jan4.getTime() +
        (week - 1) * 7 * 86_400_000 -
        ((jan4.getDay() || 7) - 1) * 86_400_000,
    );
    const sunday = new Date(monday.getTime() + 6 * 86_400_000);
    const fmt = (d: Date) =>
      d.toLocaleDateString('en-IN', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      });
    return `${fmt(monday)} – ${fmt(sunday)}, ${year}`;
  } catch {
    return weekOf;
  }
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="section-title text-base border-b border-gray-100 pb-2">
        {title}
      </h2>
      {children}
    </section>
  );
}

function TagList({ items, variant }: { items: string[]; variant: 'success' | 'warning' | 'info' }) {
  if (!items?.length) return <p className="text-sm text-gray-400 italic">None noted.</p>;
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((item, i) => (
        <li key={i} className={`badge badge-${variant} text-sm py-1 px-3`}>
          {item}
        </li>
      ))}
    </ul>
  );
}

function SkeletonDetail() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-7 w-64 bg-gray-200 rounded" />
      <div className="h-4 w-40 bg-gray-200 rounded" />
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className={`h-3 bg-gray-200 rounded ${i % 3 === 2 ? 'w-1/2' : 'w-full'}`}
          />
        ))}
      </div>
    </div>
  );
}

export default function ReportDetailPage() {
  const { user } = useAuthContext();
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [report, setReport] = useState<WeeklyReportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !id) return;

    async function load() {
      try {
        const snap = await getDoc(doc(db, COLLECTIONS.WEEKLY_REPORTS, id));
        if (!snap.exists()) {
          setError('Report not found.');
          return;
        }
        const data = snap.data() as Omit<WeeklyReportDetail, 'id'>;
        // Students can only see published reports and their own
        if (data.studentId !== user!.uid || data.status !== 'published') {
          setError('This report is not available.');
          return;
        }
        setReport({ id: snap.id, ...data });
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Could not load report.');
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [user, id]);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      {/* Back */}
      <button
        type="button"
        onClick={() => router.back()}
        className="btn-secondary text-sm px-3 py-1.5 flex items-center gap-1.5"
      >
        <span>&#x2190;</span> All Reports
      </button>

      {/* Error */}
      {error && (
        <div className="card border-red-300 bg-red-50 text-sm text-red-800">
          &#9888;&#65039; {error}
        </div>
      )}

      {/* Loading */}
      {loading && <SkeletonDetail />}

      {/* Content */}
      {!loading && report && (
        <div className="space-y-6">
          {/* Header */}
          <div>
            <h1 className="font-heading text-2xl font-bold text-charcoal">
              Weekly Report
            </h1>
            <p className="text-sm text-saffron-700 font-medium mt-0.5">
              {weekRange(report.weekOf)}
            </p>
            {report.publishedAt && (
              <p className="text-xs text-gray-400 mt-0.5">
                Published{' '}
                {new Date(report.publishedAt).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </p>
            )}
          </div>

          {/* AI disclaimer */}
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex gap-2 text-xs text-amber-800">
            <span className="flex-shrink-0">&#x1F916;</span>
            <span>
              <strong>AI-generated feedback</strong> &mdash; Summaries and advice are
              drafted by AI and reviewed &amp; approved by your teacher before publishing.
            </span>
          </div>

          {/* Readiness indicator */}
          <div
            className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
              report.readinessForNext
                ? 'border-green-300 bg-green-50'
                : 'border-yellow-300 bg-yellow-50'
            }`}
          >
            <span className="text-xl">
              {report.readinessForNext ? '\u2705' : '\u23F3'}
            </span>
            <p
              className={`text-sm font-medium ${
                report.readinessForNext ? 'text-green-800' : 'text-yellow-800'
              }`}
            >
              {report.readinessForNext
                ? 'Ready to move to the next unit'
                : 'Continue practicing current unit'}
            </p>
          </div>

          {/* AI Summary */}
          {report.aiSummary && (
            <Section title="Week Summary">
              <p className="text-base leading-relaxed text-charcoal">
                {report.aiSummary}
              </p>
            </Section>
          )}

          {/* AI Improvement Advice */}
          {report.aiImprovementAdvice && (
            <Section title="Improvement Advice">
              <p className="text-base leading-relaxed text-charcoal">
                {report.aiImprovementAdvice}
              </p>
            </Section>
          )}

          {/* Strengths */}
          <Section title="Strengths">
            <TagList items={report.strengths} variant="success" />
          </Section>

          {/* Weak Areas */}
          <Section title="Areas to Improve">
            <TagList items={report.weakAreas} variant="warning" />
          </Section>

          {/* Practice songs */}
          {report.practiceSongs?.length > 0 && (
            <Section title="Practice Songs This Week">
              <ul className="space-y-1">
                {report.practiceSongs.map((song, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-charcoal">
                    <span className="text-saffron-500 mt-0.5 flex-shrink-0">&#x266B;</span>
                    {song}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* Lyrics to revise */}
          {report.lyricsToRevise?.length > 0 && (
            <Section title="Lyrics to Revise">
              <ul className="space-y-1">
                {report.lyricsToRevise.map((l, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-charcoal">
                    <span className="text-blue-400 mt-0.5 flex-shrink-0">&#x1F4DD;</span>
                    {l}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* Required recording */}
          {report.requiredRecordingBeforeNextClass && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
              <p className="font-semibold mb-1">&#x1F3A4; Required Before Next Class</p>
              <p>{report.requiredRecordingBeforeNextClass}</p>
            </div>
          )}

          {/* Teacher remarks */}
          {report.teacherRemarks && (
            <Section title="Teacher Remarks">
              <div className="rounded-xl border border-saffron-200 bg-saffron-50 px-4 py-3">
                <p className="text-base leading-relaxed text-charcoal">
                  {report.teacherRemarks}
                </p>
              </div>
            </Section>
          )}

          {/* Lessons covered */}
          {report.lessonsCovered?.length > 0 && (
            <Section title="Lessons Covered">
              <ul className="space-y-2">
                {report.lessonsCovered.map((entry, i) => (
                  <li
                    key={i}
                    className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                  >
                    {entry.summary || `Lesson ${entry.lessonId}`}
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      )}
    </div>
  );
}
