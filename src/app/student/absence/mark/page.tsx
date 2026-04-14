/**
 * Mark Standard Absence — /student/absence/mark
 *
 * Lets a student report an absence for an upcoming class.
 * Requires at least 6 hours notice.
 */

'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useAuthContext } from '@/components/layout/AuthProvider';

interface ClassInstance {
  id: string;
  scheduledStartTime: string; // ISO
  scheduledEndTime?: string;
  batchBand?: string;
  batchBandId?: string;
}

type SubmitState = 'idle' | 'loading' | 'success' | 'error';

function formatClassOption(cls: ClassInstance) {
  const d = new Date(cls.scheduledStartTime);
  const dateStr = d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  const timeStr = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
  const batch = cls.batchBand ? `Batch ${cls.batchBand}` : '';
  return `${dateStr} at ${timeStr} IST${batch ? ' — ' + batch : ''}`;
}

export default function MarkAbsencePage() {
  const { user, apiFetch } = useAuthContext();

  const [classes, setClasses] = useState<ClassInstance[]>([]);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [classError, setClassError] = useState<string | null>(null);

  const [selectedClass, setSelectedClass] = useState('');
  const [reason, setReason] = useState('');
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    apiFetch('/api/class?upcoming=true')
      .then((r) => r.json())
      .then((data) => {
        const list: ClassInstance[] = Array.isArray(data) ? data : data.classes ?? data.instances ?? [];
        setClasses(list.filter((c) => c.scheduledStartTime));
      })
      .catch(() => setClassError('Could not load upcoming classes.'))
      .finally(() => setLoadingClasses(false));
  }, [user, apiFetch]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedClass || !reason.trim()) return;

    setSubmitState('loading');
    setSubmitError(null);

    try {
      const res = await apiFetch('/api/absence/standard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classInstanceId: selectedClass, reason: reason.trim() }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }

      setSubmitState('success');
      setSelectedClass('');
      setReason('');
    } catch (err: unknown) {
      setSubmitState('error');
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-charcoal">
          Mark Absence
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Let your teacher know you will be absent from an upcoming class.
        </p>
      </div>

      {/* 6-hour notice warning */}
      <div className="rounded-xl border border-yellow-300 bg-yellow-50 px-4 py-3 flex gap-3">
        <span className="text-lg flex-shrink-0">⏰</span>
        <p className="text-sm text-yellow-800">
          <span className="font-semibold">6-hour notice required.</span> Absences
          marked less than 6 hours before class start may be recorded as
          unexcused violations.
        </p>
      </div>

      {/* Success state */}
      {submitState === 'success' && (
        <div className="rounded-xl border border-green-300 bg-green-50 px-4 py-3 flex gap-3">
          <span className="text-lg">✅</span>
          <div>
            <p className="font-semibold text-green-800 text-sm">
              Absence submitted
            </p>
            <p className="text-xs text-green-700 mt-0.5">
              Your teacher has been notified. Stay well!
            </p>
          </div>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="card space-y-5">
        {/* Class selector */}
        <div>
          <label
            htmlFor="classSelect"
            className="block text-sm font-medium text-charcoal mb-1.5"
          >
            Upcoming class <span className="text-red-500">*</span>
          </label>
          {loadingClasses ? (
            <div className="input animate-pulse bg-gray-100 h-10" />
          ) : classError ? (
            <p className="text-sm text-red-600">{classError}</p>
          ) : (
            <select
              id="classSelect"
              className="input"
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              required
            >
              <option value="">— Select a class —</option>
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {formatClassOption(cls)}
                </option>
              ))}
            </select>
          )}
          {classes.length === 0 && !loadingClasses && !classError && (
            <p className="text-xs text-gray-400 mt-1">
              No upcoming classes scheduled.
            </p>
          )}
        </div>

        {/* Reason */}
        <div>
          <label
            htmlFor="reason"
            className="block text-sm font-medium text-charcoal mb-1.5"
          >
            Reason <span className="text-red-500">*</span>
          </label>
          <textarea
            id="reason"
            className="input min-h-[96px] resize-y"
            placeholder="Brief explanation (e.g. family event, health issue…)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            required
          />
          <p className="text-xs text-gray-400 text-right mt-0.5">
            {reason.length}/500
          </p>
        </div>

        {/* Error */}
        {submitState === 'error' && submitError && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
            ⚠️ {submitError}
          </p>
        )}

        {/* Submit */}
        <button
          type="submit"
          className="btn-primary w-full"
          disabled={
            submitState === 'loading' ||
            loadingClasses ||
            !selectedClass ||
            !reason.trim()
          }
        >
          {submitState === 'loading' ? 'Submitting…' : 'Submit Absence'}
        </button>
      </form>
    </div>
  );
}
