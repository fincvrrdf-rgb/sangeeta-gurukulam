/**
 * Grade Assessment — /teacher/assessments/[id]
 *
 * Watch the student's submitted video, then grade it. Saving a verdict
 * notifies the student automatically and offers a one-tap WhatsApp message.
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ref as storageRef, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebase/client';
import { useAuthContext } from '@/components/layout/AuthProvider';

type Result = 'pass' | 'needs_improvement' | 'fail';

interface Assessment {
  id: string;
  studentId: string;
  studentName?: string;
  title?: string;
  instructions?: string | null;
  assessmentType: string;
  status: 'assigned' | 'submitted' | 'graded';
  videoPath?: string | null;
  videoProvider?: 'supabase' | 'firebase' | null;
  videoFileName?: string | null;
  submittedAt?: string | null;
  studentNote?: string | null;
  totalScore?: number | null;
  maxScore?: number | null;
  result?: Result | null;
  feedback?: string | null;
}

const RESULTS: { value: Result; label: string; cls: string }[] = [
  { value: 'pass', label: 'Pass', cls: 'bg-green-600 border-green-600' },
  { value: 'needs_improvement', label: 'Needs Improvement', cls: 'bg-yellow-500 border-yellow-500' },
  { value: 'fail', label: 'Not Passed', cls: 'bg-red-500 border-red-500' },
];

export default function GradeAssessmentPage() {
  const { user, apiFetch } = useAuthContext();
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [result, setResult] = useState<Result>('pass');
  const [totalScore, setTotalScore] = useState('');
  const [maxScore, setMaxScore] = useState('100');
  const [feedback, setFeedback] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ whatsappLink: string | null } | null>(null);

  const load = useCallback(() => {
    if (!user) return;
    apiFetch(`/api/assessments/${id}`)
      .then((r) => r.json())
      .then(async (data) => {
        const a: Assessment = data.assessment ?? data;
        setAssessment(a);
        if (a.result) setResult(a.result);
        if (a.totalScore != null) setTotalScore(String(a.totalScore));
        if (a.maxScore != null) setMaxScore(String(a.maxScore));
        if (a.feedback) setFeedback(a.feedback);

        // Supabase submissions arrive with a signed URL already
        if (data.videoUrl) {
          setVideoUrl(data.videoUrl);
        } else if (a.videoPath && a.videoProvider === 'firebase') {
          try {
            setVideoUrl(await getDownloadURL(storageRef(storage, a.videoPath)));
          } catch { /* player shows "unavailable" */ }
        }
      })
      .catch((e) => setError(e.message ?? 'Could not load the assessment.'))
      .finally(() => setLoading(false));
  }, [user, apiFetch, id]);

  useEffect(() => { load(); }, [load]);

  async function handleGrade(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { result, feedback: feedback.trim() || undefined };
      if (totalScore !== '') body.totalScore = Number(totalScore);
      if (maxScore !== '') body.maxScore = Number(maxScore);

      const res = await apiFetch(`/api/assessments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Could not save (${res.status})`);

      setSaved({ whatsappLink: data.whatsappLink ?? null });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the grade.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
        <div className="h-7 w-52 bg-gray-200 rounded animate-pulse" />
        <div className="card animate-pulse h-48" />
      </div>
    );
  }

  if (!assessment) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="card text-center py-16 text-gray-500">
          <p>Assessment not found.</p>
          <button onClick={() => router.back()} className="btn-secondary mt-4">Go Back</button>
        </div>
      </div>
    );
  }

  const studentName = assessment.studentName || 'Student';

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">
      <div className="flex items-start gap-4">
        <Link href="/teacher/assessments" className="text-gray-400 hover:text-gray-600 mt-1 flex-shrink-0">
          ← Back
        </Link>
        <div>
          <h1 className="font-heading text-2xl font-bold text-charcoal">
            {assessment.title || 'Assessment'}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {studentName} · <span className="capitalize">{assessment.assessmentType.replace('_', ' ')}</span>
          </p>
        </div>
      </div>

      {error && <div className="card border-red-300 bg-red-50 text-red-800 text-sm">⚠️ {error}</div>}

      {saved && (
        <div className="card border-green-300 bg-green-50 space-y-3">
          <p className="text-sm font-semibold text-green-900">
            ✅ Grade saved — {studentName} has been notified.
          </p>
          {saved.whatsappLink && (
            <a
              href={saved.whatsappLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg px-4 py-2"
            >
              💬 Send the result on WhatsApp
            </a>
          )}
        </div>
      )}

      {/* The submitted video */}
      <div className="card space-y-3">
        <h2 className="section-title">Submission</h2>
        {assessment.status === 'assigned' ? (
          <p className="text-sm text-gray-400 italic">
            Waiting for {studentName} to upload their video.
          </p>
        ) : videoUrl ? (
          <video controls playsInline preload="metadata" src={videoUrl} className="w-full rounded-lg bg-black" />
        ) : (
          <p className="text-sm text-gray-400 italic">
            {assessment.videoPath ? 'Loading video…' : 'No video available.'}
          </p>
        )}
        {assessment.studentNote && (
          <p className="text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2">
            <span className="font-medium">Student note:</span> {assessment.studentNote}
          </p>
        )}
      </div>

      {/* Grading */}
      <form onSubmit={handleGrade} className="card space-y-5">
        <h2 className="section-title">
          {assessment.status === 'graded' ? 'Update Grade' : 'Grade'}
        </h2>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-2">Result</label>
          <div className="grid grid-cols-3 gap-2">
            {RESULTS.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setResult(r.value)}
                className={`py-2 rounded-lg text-xs font-semibold border-2 transition-colors ${
                  result === r.value ? `${r.cls} text-white` : 'bg-white border-gray-300 text-gray-700'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Score</label>
            <input
              type="number" min={0} className="input" value={totalScore}
              onChange={(e) => setTotalScore(e.target.value)} placeholder="e.g. 42"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Out of</label>
            <input
              type="number" min={1} className="input" value={maxScore}
              onChange={(e) => setMaxScore(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Feedback for the student</label>
          <textarea
            className="input" rows={4} value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="What went well, and what to work on next."
          />
        </div>

        <button
          type="submit"
          disabled={saving || assessment.status === 'assigned'}
          className="btn-primary w-full disabled:opacity-60"
        >
          {saving ? 'Saving…'
            : assessment.status === 'assigned' ? 'Waiting for the video'
            : assessment.status === 'graded' ? 'Update Grade' : 'Save Grade & Notify Student'}
        </button>
      </form>
    </div>
  );
}
