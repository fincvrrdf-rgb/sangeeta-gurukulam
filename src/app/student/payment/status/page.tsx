/**
 * Payment Status — /student/payment/status
 *
 * Shows the student's payment status for the current month,
 * violation counter with visual indicator, and history of past months.
 * Surfaces a prominent CTA when payment is due or overdue.
 */

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuthContext } from '@/components/layout/AuthProvider';

interface PaymentMonthRecord {
  month: string;           // YYYY-MM
  status: string;          // PaymentProofStatus or PaymentStatus value
  submittedAt?: string;    // ISO date if proof was submitted
  reviewedAt?: string;     // ISO date if reviewed
  amount?: number;
  currency?: string;
}

interface PaymentSummary {
  currentStatus: string;
  consecutiveViolations: number;
  totalViolations: number;
  history: PaymentMonthRecord[];
}

const DUE_STATUSES = new Set(['not_required_yet', 'compulsory', 'optional', 'overdue']);
const VIOLATION_MAX_DISPLAY = 5;

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'paid':
    case 'accepted':
    case 'waived':
      return 'badge badge-success';
    case 'pending_review':
    case 'proof_submitted':
      return 'badge badge-info';
    case 'compulsory':
    case 'overdue':
    case 'rejected':
      return 'badge badge-error';
    case 'optional':
      return 'badge badge-warning';
    default:
      return 'badge badge-neutral';
  }
}

function statusLabel(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatMonth(yyyyMm: string): string {
  const [year, month] = yyyyMm.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function ViolationDots({ count, max }: { count: number; max: number }) {
  return (
    <div className="flex gap-1.5 mt-2">
      {Array.from({ length: max }).map((_, i) => (
        <div
          key={i}
          className={`w-5 h-5 rounded-full border-2 transition-colors ${
            i < count
              ? 'bg-red-500 border-red-500'
              : 'bg-gray-100 border-gray-300'
          }`}
        />
      ))}
      {count > max && (
        <span className="text-xs text-red-600 font-semibold self-center ml-1">
          +{count - max}
        </span>
      )}
    </div>
  );
}

function SkeletonBlock() {
  return (
    <div className="card animate-pulse space-y-3">
      <div className="h-4 w-32 bg-gray-200 rounded" />
      <div className="h-6 w-24 bg-gray-200 rounded" />
      <div className="h-3 w-48 bg-gray-200 rounded" />
    </div>
  );
}

export default function PaymentStatusPage() {
  const { user, apiFetch } = useAuthContext();
  const [summary, setSummary] = useState<PaymentSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    apiFetch('/api/payment/status')
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load payment data (${r.status})`);
        return r.json();
      })
      .then((data) => setSummary(data))
      .catch((err) => setError(err.message ?? 'Could not load payment status.'))
      .finally(() => setLoading(false));
  }, [user, apiFetch]);

  const thisMonth = currentMonth();
  const isPaymentDue =
    summary && DUE_STATUSES.has(summary.currentStatus);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-heading text-2xl font-bold text-charcoal">
          Payment Status
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Track your monthly fee payments and violation history.
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="card border-red-300 bg-red-50 text-red-800 text-sm">
          &#9888;&#65039; {error}
        </div>
      )}

      {/* Loading skeletons */}
      {loading && (
        <>
          <SkeletonBlock />
          <SkeletonBlock />
        </>
      )}

      {!loading && summary && (
        <>
          {/* Current month status */}
          <div className="card space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">
                  Current Month
                </p>
                <p className="text-lg font-heading font-semibold text-charcoal mt-0.5">
                  {formatMonth(thisMonth)}
                </p>
              </div>
              <span className={`${statusBadgeClass(summary.currentStatus)} text-sm px-3 py-1`}>
                {statusLabel(summary.currentStatus)}
              </span>
            </div>

            {/* Payment due CTA */}
            {isPaymentDue && (
              <div className="rounded-lg border border-saffron-300 bg-saffron-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-saffron-900">
                    Payment required this month
                  </p>
                  <p className="text-xs text-saffron-700 mt-0.5">
                    Upload your payment screenshot or receipt to avoid a violation.
                  </p>
                </div>
                <Link
                  href="/student/payment/upload"
                  className="btn-primary text-sm flex-shrink-0"
                >
                  Upload Proof
                </Link>
              </div>
            )}
          </div>

          {/* Violation counter */}
          <div
            className={`card space-y-2 ${
              summary.consecutiveViolations >= 2
                ? 'border-red-300 bg-red-50'
                : summary.consecutiveViolations === 1
                ? 'border-yellow-300 bg-yellow-50'
                : 'border-green-200 bg-green-50'
            }`}
          >
            <div className="flex items-center justify-between">
              <p className="section-title text-base">Violation Counter</p>
              {summary.consecutiveViolations >= 2 && (
                <span className="badge badge-error">Action required</span>
              )}
              {summary.consecutiveViolations === 0 && (
                <span className="badge badge-success">In good standing</span>
              )}
            </div>

            <div className="flex gap-8">
              <div>
                <p
                  className={`text-3xl font-bold ${
                    summary.consecutiveViolations >= 2
                      ? 'text-red-600'
                      : summary.consecutiveViolations === 1
                      ? 'text-yellow-700'
                      : 'text-green-700'
                  }`}
                >
                  {summary.consecutiveViolations}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">Consecutive</p>
                <ViolationDots
                  count={summary.consecutiveViolations}
                  max={VIOLATION_MAX_DISPLAY}
                />
              </div>
              <div>
                <p className="text-3xl font-bold text-charcoal">
                  {summary.totalViolations}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">Total all-time</p>
              </div>
            </div>

            {summary.consecutiveViolations >= 2 && (
              <p className="text-xs text-red-700">
                2+ consecutive violations may lead to suspension. Please upload payment proof immediately.
              </p>
            )}
          </div>

          {/* History */}
          {summary.history && summary.history.length > 0 && (
            <section>
              <h2 className="section-title mb-3">Payment History</h2>
              <div className="card p-0 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium text-gray-600">
                          Month
                        </th>
                        <th className="px-4 py-3 text-left font-medium text-gray-600">
                          Status
                        </th>
                        <th className="px-4 py-3 text-left font-medium text-gray-600 hidden sm:table-cell">
                          Submitted
                        </th>
                        <th className="px-4 py-3 text-left font-medium text-gray-600 hidden sm:table-cell">
                          Reviewed
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {summary.history.map((rec) => (
                        <tr
                          key={rec.month}
                          className="hover:bg-gray-50 transition-colors"
                        >
                          <td className="px-4 py-3 text-charcoal font-medium whitespace-nowrap">
                            {formatMonth(rec.month)}
                          </td>
                          <td className="px-4 py-3">
                            <span className={statusBadgeClass(rec.status)}>
                              {statusLabel(rec.status)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-500 hidden sm:table-cell whitespace-nowrap">
                            {rec.submittedAt
                              ? new Date(rec.submittedAt).toLocaleDateString('en-IN', {
                                  day: 'numeric',
                                  month: 'short',
                                })
                              : '—'}
                          </td>
                          <td className="px-4 py-3 text-gray-500 hidden sm:table-cell whitespace-nowrap">
                            {rec.reviewedAt
                              ? new Date(rec.reviewedAt).toLocaleDateString('en-IN', {
                                  day: 'numeric',
                                  month: 'short',
                                })
                              : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}

          {/* No history empty state */}
          {(!summary.history || summary.history.length === 0) && (
            <div className="card text-center text-gray-400 py-8 text-sm">
              No payment history yet.
            </div>
          )}
        </>
      )}
    </div>
  );
}
