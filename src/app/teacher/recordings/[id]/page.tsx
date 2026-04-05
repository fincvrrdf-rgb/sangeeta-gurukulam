/**
 * Review Individual Recording — /teacher/recordings/[id]
 *
 * Shows recording details and audio player.
 * Allows teacher to submit a review with status, feedback, and optional scores.
 * Supports running AI pitch check.
 */

'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthContext } from '@/components/layout/AuthProvider';

type ReviewStatus = 'accepted' | 'needs_improvement' | 'rejected';

interface RecordingDetail {
  id: string;
  studentName: string;
  unitName: string;
  submittedAt: string;
  audioUrl: string;
  status: string;
  existingFeedback?: string;
  pitchScore?: number | null;
  rhythmScore?: number | null;
}

const REVIEW_STATUSES: { value: ReviewStatus; label: string; badgeClass: string }[] = [
  { value: 'accepted', label: 'Accepted', badgeClass: 'badge badge-success' },
  { value: 'needs_improvement', label: 'Needs Improvement', badgeClass: 'badge badge-warning' },
  { value: 'rejected', label: 'Rejected', badgeClass: 'badge badge-error' },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

export default function RecordingReviewPage() {
  const { user, apiFetch } = useAuthContext();
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [recording, setRecording] = useState<RecordingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Review form
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus>('accepted');
  const [feedback, setFeedback] = useState('');
  const [pitchScore, setPitchScore] = useState('');
  const [rhythmScore, setRhythmScore] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Pitch check
  const [runningPitchCheck, setRunningPitchCheck] = useState(false);
  const [pitchResult, setPitchResult] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    apiFetch(`/api/recordings/${id}`)
      .then((r) => r.json())
      .then((data: RecordingDetail) => {
        setRecording(data);
        if (data.existingFeedback) setFeedback(data.existingFeedback);
        if (data.pitchScore != null) setPitchScore(String(data.pitchScore));
        if (data.rhythmScore != null) setRhythmScore(String(data.rhythmScore));
      })
      .catch((err) => setError(err.message ?? 'Failed to load recording.'))
      .finally(() => setLoading(false));
  }, [user, apiFetch, id]);

  function flash(msg: string) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3500);
  }

  async function handleReviewSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { status: reviewStatus, feedback };
      const scores: Record<string, number> = {};
      if (pitchScore) scores.pitchScore = parseFloat(pitchScore);
      if (rhythmScore) scores.rhythmScore = parseFloat(rhythmScore);
      if (Object.keys(scores).length > 0) body.scores = scores;

      const res = await apiFetch(`/api/recordings/${id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Error ${res.status}`);
      }
      setRecording((prev) => prev ? { ...prev, status: reviewStatus } : prev);
      flash('Review submitted successfully.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit review.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePitchCheck() {
    setRunningPitchCheck(true);
    setPitchResult(null);
    setError(null);
    try {
      const res = await apiFetch(`/api/recordings/${id}/pitch-check`, { method: 'POST' });
      if (!res.ok) throw new Error(`Pitch check failed (${res.status})`);
      const data = await res.json();
      setPitchResult(data.summary ?? data.result ?? 'Pitch check complete.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Pitch check failed.');
    } finally {
      setRunningPitchCheck(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
        <div className="h-7 w-52 bg-gray-200 rounded animate-pulse" />
        <div className="card animate-pulse space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-4 bg-gray-200 rounded w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (!recording) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="card text-center py-16 text-gray-500">
          <p>Recording not found.</p>
          <button onClick={() => router.back()} className="btn-secondary mt-4">Go Back</button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-heading text-2xl font-bold text-charcoal">Review Recording</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {recording.studentName} · {recording.unitName}
          </p>
        </div>
        <button onClick={() => router.back()} className="btn-secondary text-sm flex-shrink-0">
          ← Back
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

      {/* Recording Details */}
      <div className="card space-y-3">
        <h2 className="section-title">Recording Details</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Student</p>
            <p className="font-medium text-charcoal">{recording.studentName}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Unit</p>
            <p className="font-medium text-charcoal">{recording.unitName}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Submitted</p>
            <p className="font-medium text-charcoal">{formatDate(recording.submittedAt)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Status</p>
            <span className={`badge ${
              recording.status === 'reviewed' ? 'badge-success' :
              recording.status === 'submitted' ? 'badge-warning' : 'badge-neutral'
            }`}>
              {recording.status}
            </span>
          </div>
        </div>
      </div>

      {/* Audio Player */}
      <div className="card space-y-3">
        <h2 className="section-title">Audio</h2>
        {recording.audioUrl ? (
          <audio
            controls
            src={recording.audioUrl}
            className="w-full rounded-lg"
            preload="metadata"
          >
            Your browser does not support the audio element.
          </audio>
        ) : (
          <p className="text-sm text-gray-400 italic">No audio URL available.</p>
        )}

        <div className="flex items-center justify-between pt-1">
          <button
            onClick={handlePitchCheck}
            disabled={runningPitchCheck}
            className="btn-secondary text-sm"
          >
            {runningPitchCheck ? 'Analysing…' : '🎵 Run Pitch Check'}
          </button>
        </div>

        {/* Pitch Check Result */}
        {pitchResult && (
          <div className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-3">
            <p className="text-xs font-semibold text-teal-700 mb-1">Pitch Check Result</p>
            <p className="text-sm text-teal-900 whitespace-pre-wrap">{pitchResult}</p>
          </div>
        )}
      </div>

      {/* Review Form */}
      <form onSubmit={handleReviewSubmit} className="card space-y-5">
        <h2 className="section-title">Submit Review</h2>

        {/* Status */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-gray-700">Review Status *</label>
          <div className="flex flex-wrap gap-2">
            {REVIEW_STATUSES.map(({ value, label }) => (
              <label
                key={value}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-colors text-sm ${
                  reviewStatus === value
                    ? 'border-saffron-400 bg-saffron-50 text-saffron-700 font-medium'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                }`}
              >
                <input
                  type="radio"
                  name="reviewStatus"
                  value={value}
                  checked={reviewStatus === value}
                  onChange={() => setReviewStatus(value)}
                  className="sr-only"
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        {/* Feedback */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-700">Feedback</label>
          <textarea
            rows={4}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Write your feedback for the student..."
            className="input resize-y"
          />
        </div>

        {/* Optional Scores */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-700">Pitch Score (optional)</label>
            <input
              type="number"
              min="0"
              max="10"
              step="0.1"
              value={pitchScore}
              onChange={(e) => setPitchScore(e.target.value)}
              placeholder="0–10"
              className="input"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-700">Rhythm Score (optional)</label>
            <input
              type="number"
              min="0"
              max="10"
              step="0.1"
              value={rhythmScore}
              onChange={(e) => setRhythmScore(e.target.value)}
              placeholder="0–10"
              className="input"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="btn-secondary"
            disabled={submitting}
          >
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit Review'}
          </button>
        </div>
      </form>
    </div>
  );
}
