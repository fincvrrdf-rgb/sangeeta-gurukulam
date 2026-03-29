/**
 * Create Assessment — /teacher/assessments/new
 *
 * Form for scoring a student on the standard rubric dimensions.
 * Auto-calculates total and pass/fail (60% threshold).
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthContext } from '@/components/layout/AuthProvider';
import { DEFAULT_RUBRIC_DIMENSIONS } from '@/domain/constants';

type AssessmentType = 'formative' | 'testing_day' | 'makeup';

interface StudentOption {
  id: string;
  name: string;
  batchBand: string;
}

interface TeachingUnitOption {
  id: string;
  name: string;
  lessonName: string;
}

const ASSESSMENT_TYPES: { value: AssessmentType; label: string; description: string }[] = [
  { value: 'formative',    label: 'Formative',    description: 'Regular progress check' },
  { value: 'testing_day',  label: 'Testing Day',  description: 'Scheduled Saturday test' },
  { value: 'makeup',       label: 'Makeup',       description: 'Repeat assessment' },
];

const PASS_THRESHOLD = 0.60;
const MAX_PER_DIMENSION = 10;

function ScoreSlider({
  dimension,
  value,
  onChange,
}: {
  dimension: (typeof DEFAULT_RUBRIC_DIMENSIONS)[number];
  value: number;
  onChange: (val: number) => void;
}) {
  const pct = (value / dimension.maxScore) * 100;
  const color = value >= 6 ? 'text-green-700' : value >= 4 ? 'text-yellow-700' : 'text-red-600';

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-charcoal">{dimension.label}</p>
          <p className="text-xs text-gray-400">{dimension.description}</p>
        </div>
        <span className={`text-lg font-bold tabular-nums w-10 text-right ${color}`}>
          {value}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={dimension.maxScore}
          step={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 h-2 accent-saffron-600 cursor-pointer"
          aria-label={`${dimension.label} score`}
        />
        <div className="flex gap-0.5">
          {Array.from({ length: dimension.maxScore + 1 }, (_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onChange(i)}
              className={`w-4 h-4 rounded-sm text-[9px] font-bold transition-colors ${
                i <= value
                  ? 'bg-saffron-500 text-white'
                  : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
              }`}
              aria-label={`Set ${dimension.label} to ${i}`}
            >
              {i}
            </button>
          ))}
        </div>
      </div>
      <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            pct >= 60 ? 'bg-green-400' : pct >= 40 ? 'bg-yellow-400' : 'bg-red-400'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function NewAssessmentPage() {
  const router = useRouter();
  const { user, apiFetch } = useAuthContext();

  // Dropdown data
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [units, setUnits] = useState<TeachingUnitOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);

  // Form values
  const [studentId, setStudentId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [assessmentType, setAssessmentType] = useState<AssessmentType>('formative');
  const [scores, setScores] = useState<Record<string, number>>(
    Object.fromEntries(DEFAULT_RUBRIC_DIMENSIONS.map((d) => [d.key, 5]))
  );
  const [feedback, setFeedback] = useState('');

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      apiFetch('/api/students').then((r) => r.json()),
      apiFetch('/api/teaching-units').then((r) => r.json()),
    ])
      .then(([studentData, unitData]) => {
        setStudents(Array.isArray(studentData) ? studentData : studentData.students ?? []);
        setUnits(Array.isArray(unitData) ? unitData : unitData.units ?? []);
      })
      .catch(() => {
        // Non-fatal: teacher can still manually input if needed; dropdowns stay empty
      })
      .finally(() => setLoadingOptions(false));
  }, [user, apiFetch]);

  // Computed totals
  const totalScore = DEFAULT_RUBRIC_DIMENSIONS.reduce((sum, d) => sum + (scores[d.key] ?? 0), 0);
  const maxScore = DEFAULT_RUBRIC_DIMENSIONS.length * MAX_PER_DIMENSION;
  const percentage = Math.round((totalScore / maxScore) * 100);
  const isPassing = totalScore / maxScore >= PASS_THRESHOLD;

  function setScore(key: string, value: number) {
    setScores((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!studentId) {
      setFormError('Please select a student.');
      return;
    }
    if (!unitId) {
      setFormError('Please select a teaching unit.');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const payload = {
        studentId,
        teachingUnitId: unitId,
        assessmentType,
        rubricScores: DEFAULT_RUBRIC_DIMENSIONS.map((d) => ({
          dimensionKey: d.key,
          score: scores[d.key] ?? 0,
          maxScore: d.maxScore,
        })),
        totalScore,
        maxScore,
        result: isPassing ? 'pass' : 'fail',
        feedback: feedback.trim() || undefined,
      };

      const res = await apiFetch('/api/assessments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? 'Submission failed');
      }

      router.push('/teacher/assessments');
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Could not save assessment. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link href="/teacher/assessments" className="text-gray-400 hover:text-gray-600 mt-1 flex-shrink-0">
          ← Back
        </Link>
        <div>
          <h1 className="font-heading text-2xl font-bold text-charcoal">New Assessment</h1>
          <p className="text-sm text-gray-500 mt-0.5">Score a student across all rubric dimensions</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Form validation error */}
        {formError && (
          <div className="card border-red-300 bg-red-50 text-red-800 text-sm">
            ⚠️ {formError}
          </div>
        )}

        {/* Student + Unit + Type */}
        <div className="card space-y-4">
          <h2 className="section-title">Assessment Details</h2>

          {/* Student */}
          <div>
            <label htmlFor="student" className="block text-sm font-medium text-gray-700 mb-1">
              Student <span className="text-red-500">*</span>
            </label>
            {loadingOptions ? (
              <div className="input flex items-center h-[38px] animate-pulse bg-gray-100" />
            ) : (
              <select
                id="student"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                className="input"
                required
              >
                <option value="">Select a student…</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.batchBand ? `(Batch ${s.batchBand})` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Teaching Unit */}
          <div>
            <label htmlFor="unit" className="block text-sm font-medium text-gray-700 mb-1">
              Teaching Unit <span className="text-red-500">*</span>
            </label>
            {loadingOptions ? (
              <div className="input flex items-center h-[38px] animate-pulse bg-gray-100" />
            ) : (
              <select
                id="unit"
                value={unitId}
                onChange={(e) => setUnitId(e.target.value)}
                className="input"
                required
              >
                <option value="">Select a unit…</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} {u.lessonName ? `— ${u.lessonName}` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Assessment Type */}
          <div>
            <p className="block text-sm font-medium text-gray-700 mb-2">
              Assessment Type <span className="text-red-500">*</span>
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {ASSESSMENT_TYPES.map(({ value, label, description }) => (
                <label
                  key={value}
                  className={`flex flex-col gap-0.5 border-2 rounded-lg p-3 cursor-pointer transition-all ${
                    assessmentType === value
                      ? 'border-saffron-500 bg-saffron-50'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="assessmentType"
                    value={value}
                    checked={assessmentType === value}
                    onChange={() => setAssessmentType(value)}
                    className="sr-only"
                  />
                  <span className="text-sm font-semibold text-charcoal">{label}</span>
                  <span className="text-xs text-gray-400">{description}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Live Score Summary */}
        <div className={`card flex items-center gap-4 ${isPassing ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'}`}>
          <div className={`w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0 text-white font-bold text-lg ${isPassing ? 'bg-green-500' : 'bg-red-500'}`}>
            {percentage}%
          </div>
          <div>
            <p className={`text-base font-semibold ${isPassing ? 'text-green-800' : 'text-red-800'}`}>
              {isPassing ? 'Passing' : 'Not Passing'} — {totalScore} / {maxScore} pts
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              Pass threshold: {Math.round(PASS_THRESHOLD * 100)}% ({Math.ceil(maxScore * PASS_THRESHOLD)} pts)
            </p>
          </div>
        </div>

        {/* Rubric Sliders */}
        <div className="card space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="section-title">Rubric Scoring</h2>
            <p className="text-xs text-gray-400">0 – 10 per dimension</p>
          </div>

          {DEFAULT_RUBRIC_DIMENSIONS.map((dim) => (
            <ScoreSlider
              key={dim.key}
              dimension={dim}
              value={scores[dim.key] ?? 5}
              onChange={(val) => setScore(dim.key, val)}
            />
          ))}
        </div>

        {/* Feedback */}
        <div className="card space-y-3">
          <h2 className="section-title">Feedback</h2>
          <textarea
            rows={4}
            placeholder="Write personalised feedback for the student and their progress…"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            className="input resize-none"
          />
        </div>

        {/* Submit Error */}
        {submitError && (
          <div className="card border-red-300 bg-red-50 text-red-800 text-sm">
            ⚠️ {submitError}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pb-6">
          <Link href="/teacher/assessments" className="btn-secondary">
            Cancel
          </Link>
          <button
            type="submit"
            disabled={submitting}
            className="btn-primary"
          >
            {submitting ? 'Saving…' : `Save Assessment (${isPassing ? 'Pass' : 'Fail'})`}
          </button>
        </div>

      </form>
    </div>
  );
}
