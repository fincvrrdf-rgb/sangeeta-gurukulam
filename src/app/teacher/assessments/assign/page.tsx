/**
 * Assign Assessment — /teacher/assessments/assign
 *
 * The teacher sets a test for a student. The student is notified in-app and
 * uploads a video of themselves performing it; the teacher is notified when it
 * arrives and grades it from /teacher/assessments/[id].
 *
 * No scores are entered here — grading happens after watching the video.
 */

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuthContext } from '@/components/layout/AuthProvider';

type AssessmentType = 'formative' | 'testing_day' | 'makeup';

interface StudentOption { id?: string; userId?: string; fullName?: string; studentName?: string }
interface UnitOption { id: string; unitName?: string }

const TYPES: { value: AssessmentType; label: string }[] = [
  { value: 'formative', label: 'Formative' },
  { value: 'testing_day', label: 'Testing Day' },
  { value: 'makeup', label: 'Makeup' },
];

const DEFAULT_INSTRUCTIONS =
  'Record a video of yourself performing this piece. Keep your hands in frame so your taalam is visible, ' +
  'and make sure the room is quiet with your shruti/tanpura audible.';

export default function AssignAssessmentPage() {
  const { user, apiFetch } = useAuthContext();

  const [students, setStudents] = useState<StudentOption[]>([]);
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);

  const [studentId, setStudentId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [assessmentType, setAssessmentType] = useState<AssessmentType>('testing_day');
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState(DEFAULT_INSTRUCTIONS);
  const [dueDate, setDueDate] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ name: string; whatsappLink: string | null } | null>(null);

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
      .catch(() => { /* dropdowns stay empty; non-fatal */ })
      .finally(() => setLoadingOptions(false));
  }, [user, apiFetch]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!studentId) return setError('Please select a student.');
    if (!unitId) return setError('Please select a teaching unit.');

    setSubmitting(true);
    try {
      const res = await apiFetch('/api/assessments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId,
          teachingUnitId: unitId,
          assessmentType,
          title: title.trim() || undefined,
          instructions: instructions.trim() || undefined,
          dueDate: dueDate || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Could not assign (${res.status})`);

      setCreated({ name: data.studentName ?? 'the student', whatsappLink: data.whatsappLink ?? null });
      // Reset for the next assignment
      setStudentId('');
      setTitle('');
      setDueDate('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not assign the test.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-start gap-4">
        <Link href="/teacher/assessments" className="text-gray-400 hover:text-gray-600 mt-1 flex-shrink-0">
          ← Back
        </Link>
        <div>
          <h1 className="font-heading text-2xl font-bold text-charcoal">Assign a Test</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            The student uploads a video; you grade it after watching.
          </p>
        </div>
      </div>

      {/* Success + one-tap WhatsApp nudge */}
      {created && (
        <div className="card border-green-300 bg-green-50 space-y-3">
          <p className="text-sm font-semibold text-green-900">
            ✅ Test assigned — {created.name} has been notified in the app.
          </p>
          {created.whatsappLink ? (
            <a
              href={created.whatsappLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg px-4 py-2"
            >
              💬 Tell {created.name} on WhatsApp
            </a>
          ) : (
            <p className="text-xs text-green-800">
              No WhatsApp number on file for this student — add their phone in Students to enable one-tap messaging.
            </p>
          )}
          <button
            type="button"
            onClick={() => setCreated(null)}
            className="block text-xs text-green-700 underline"
          >
            Assign another
          </button>
        </div>
      )}

      {error && <div className="card border-red-300 bg-red-50 text-red-800 text-sm">⚠️ {error}</div>}

      <form onSubmit={handleSubmit} className="card space-y-5">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Student</label>
          <select
            className="input"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            disabled={loadingOptions}
          >
            <option value="">{loadingOptions ? 'Loading…' : '— Select student —'}</option>
            {students.map((s) => {
              const id = s.id ?? s.userId ?? '';
              const name = s.fullName ?? s.studentName ?? id;
              return <option key={id} value={id}>{name}</option>;
            })}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Teaching Unit</label>
          <select
            className="input"
            value={unitId}
            onChange={(e) => setUnitId(e.target.value)}
            disabled={loadingOptions}
          >
            <option value="">{loadingOptions ? 'Loading…' : '— Select unit —'}</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>{u.unitName ?? u.id}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
            <select
              className="input"
              value={assessmentType}
              onChange={(e) => setAssessmentType(e.target.value as AssessmentType)}
            >
              {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Due date (optional)</label>
            <input type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Title (optional)</label>
          <input
            className="input"
            placeholder="e.g. Geetham 1 — final test"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Instructions for the student</label>
          <textarea
            className="input"
            rows={4}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
          />
          <p className="text-[11px] text-gray-400 mt-1">
            Students can only upload video files, so the taalam is always visible.
          </p>
        </div>

        <button type="submit" disabled={submitting} className="btn-primary w-full">
          {submitting ? 'Assigning…' : 'Assign Test'}
        </button>
      </form>
    </div>
  );
}
