/**
 * Long Absence Request — /student/absence/long
 *
 * Allows students to request an extended absence (multi-day).
 * Shows existing requests with status badges.
 */

'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useAuthContext } from '@/components/layout/AuthProvider';

type ReasonCategory = 'family' | 'medical' | 'travel' | 'other';
type AbsenceStatus = 'pending' | 'approved' | 'denied';

interface LongAbsenceRequest {
  id: string;
  startDate: string;
  endDate: string;
  reason: string;
  reasonCategory: ReasonCategory;
  status: AbsenceStatus;
  createdAt: string;
}

type SubmitState = 'idle' | 'loading' | 'success' | 'error';

function statusBadgeClass(status: AbsenceStatus) {
  switch (status) {
    case 'approved': return 'badge badge-success';
    case 'denied':   return 'badge badge-error';
    default:         return 'badge badge-warning';
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function daysBetween(start: string, end: string) {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.max(1, Math.round(ms / 86_400_000) + 1);
}

const REASON_LABELS: Record<ReasonCategory, string> = {
  family: 'Family',
  medical: 'Medical',
  travel: 'Travel',
  other: 'Other',
};

export default function LongAbsencePage() {
  const { user, apiFetch } = useAuthContext();

  const [requests, setRequests] = useState<LongAbsenceRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reasonCategory, setReasonCategory] = useState<ReasonCategory>('family');
  const [reason, setReason] = useState('');
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [submitError, setSubmitError] = useState<string | null>(null);

  function loadRequests() {
    if (!user) return;
    apiFetch('/api/absence/long')
      .then((r) => r.json())
      .then((data) => setRequests(Array.isArray(data) ? data : data.requests ?? []))
      .catch(() => setFetchError('Could not load existing requests.'))
      .finally(() => setLoadingRequests(false));
  }

  useEffect(() => { loadRequests(); }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!startDate || !endDate || !reason.trim()) return;

    setSubmitState('loading');
    setSubmitError(null);

    try {
      const res = await apiFetch('/api/absence/long', {
        method: 'POST',
        body: JSON.stringify({ startDate, endDate, reason: reason.trim(), reasonCategory }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }

      setSubmitState('success');
      setStartDate('');
      setEndDate('');
      setReason('');
      setReasonCategory('family');
      setLoadingRequests(true);
      loadRequests();
    } catch (err: unknown) {
      setSubmitState('error');
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }

  const dateRangeValid =
    startDate && endDate && new Date(endDate) >= new Date(startDate);

  return (
    <div className="max-w-lg mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="font-heading text-2xl font-bold text-charcoal">
          Long Absence Request
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Request an extended leave spanning multiple class sessions.
        </p>
      </div>

      {/* Success banner */}
      {submitState === 'success' && (
        <div className="rounded-xl border border-green-300 bg-green-50 px-4 py-3 flex gap-3">
          <span className="text-lg">✅</span>
          <div>
            <p className="font-semibold text-green-800 text-sm">
              Request submitted
            </p>
            <p className="text-xs text-green-700 mt-0.5">
              Your teacher will review and respond soon.
            </p>
          </div>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="card space-y-5">
        <h2 className="section-title">New Request</h2>

        {/* Date range */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">
              Start date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              className="input"
              min={today}
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                if (endDate && e.target.value > endDate) setEndDate(e.target.value);
              }}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">
              End date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              className="input"
              min={startDate || today}
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              required
            />
          </div>
        </div>

        {dateRangeValid && (
          <p className="text-xs text-saffron-700 bg-saffron-50 rounded-lg px-3 py-1.5">
            📅 {daysBetween(startDate, endDate)} day(s) selected
          </p>
        )}

        {/* Category */}
        <div>
          <label className="block text-sm font-medium text-charcoal mb-1.5">
            Category <span className="text-red-500">*</span>
          </label>
          <select
            className="input"
            value={reasonCategory}
            onChange={(e) => setReasonCategory(e.target.value as ReasonCategory)}
            required
          >
            {(Object.keys(REASON_LABELS) as ReasonCategory[]).map((k) => (
              <option key={k} value={k}>
                {REASON_LABELS[k]}
              </option>
            ))}
          </select>
        </div>

        {/* Reason */}
        <div>
          <label className="block text-sm font-medium text-charcoal mb-1.5">
            Details <span className="text-red-500">*</span>
          </label>
          <textarea
            className="input min-h-[96px] resize-y"
            placeholder="Please describe the reason for your extended absence…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={1000}
            required
          />
          <p className="text-xs text-gray-400 text-right mt-0.5">
            {reason.length}/1000
          </p>
        </div>

        {/* Error */}
        {submitState === 'error' && submitError && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
            ⚠️ {submitError}
          </p>
        )}

        <button
          type="submit"
          className="btn-primary w-full"
          disabled={
            submitState === 'loading' ||
            !dateRangeValid ||
            !reason.trim()
          }
        >
          {submitState === 'loading' ? 'Submitting…' : 'Submit Request'}
        </button>
      </form>

      {/* Existing requests */}
      <section>
        <h2 className="section-title mb-3">Your Requests</h2>

        {fetchError && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
            ⚠️ {fetchError}
          </p>
        )}

        {loadingRequests ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="card animate-pulse space-y-2">
                <div className="h-3 w-40 bg-gray-200 rounded" />
                <div className="h-3 w-64 bg-gray-200 rounded" />
              </div>
            ))}
          </div>
        ) : requests.length === 0 ? (
          <div className="card text-center text-gray-400 py-8 text-sm">
            No long absence requests yet.
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map((req) => (
              <div key={req.id} className="card space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-charcoal">
                      {formatDate(req.startDate)} &mdash; {formatDate(req.endDate)}
                      <span className="text-gray-400 font-normal ml-1.5 text-xs">
                        ({daysBetween(req.startDate, req.endDate)} days)
                      </span>
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      <span className="badge badge-neutral mr-1.5">
                        {REASON_LABELS[req.reasonCategory]}
                      </span>
                      {req.reason}
                    </p>
                  </div>
                  <span className={`${statusBadgeClass(req.status)} flex-shrink-0`}>
                    {req.status}
                  </span>
                </div>
                <p className="text-xs text-gray-400">
                  Submitted {formatDate(req.createdAt)}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
