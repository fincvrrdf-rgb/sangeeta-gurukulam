/**
 * Admin Student Management — /admin/students
 *
 * Lists all students with batch band, current unit, violations, and payment status.
 * Filters by batch band and payment status.
 * Link to onboard new student.
 */

'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useAuthContext } from '@/components/layout/AuthProvider';
import type { StudentProfile, BatchBand } from '@/domain/types';

interface StudentRow extends StudentProfile {
  batchBandCode?: string;
  paymentStatus?: string; // 'paid' | 'pending' | 'overdue' | unknown
  email?: string;
}

const PAYMENT_STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'paid', label: 'Paid' },
  { value: 'pending', label: 'Pending' },
  { value: 'overdue', label: 'Overdue / Compulsory' },
];

function paymentBadgeClass(status?: string) {
  switch (status) {
    case 'paid':
      return 'badge-success';
    case 'pending':
      return 'badge-warning';
    case 'overdue':
    case 'compulsory_unpaid':
      return 'badge-error';
    default:
      return 'badge-neutral';
  }
}

function paymentLabel(status?: string) {
  if (!status) return 'Unknown';
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <div className="w-9 h-9 rounded-full bg-teal-100 flex items-center justify-center flex-shrink-0">
      <span className="text-sm font-bold text-teal-700">{initials}</span>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 px-5 py-4 animate-pulse border-b border-gray-100">
      <div className="w-9 h-9 rounded-full bg-gray-200 flex-shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3.5 w-40 bg-gray-200 rounded" />
        <div className="h-3 w-28 bg-gray-100 rounded" />
      </div>
      <div className="h-5 w-16 bg-gray-100 rounded-full" />
    </div>
  );
}

export default function StudentsPage() {
  const { user, apiFetch } = useAuthContext();

  const [students, setStudents] = useState<StudentRow[]>([]);
  const [bands, setBands] = useState<BatchBand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [filterBand, setFilterBand] = useState('');
  const [filterPayment, setFilterPayment] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const load = useCallback(() => {
    if (!user) return;
    setLoading(true);
    setError(null);

    Promise.all([
      apiFetch('/api/admin/students').then((r) => r.json()),
      apiFetch('/api/admin/batches').then((r) => r.json()),
    ])
      .then(([studentData, batchData]) => {
        const batchList: BatchBand[] = batchData.batches ?? [];
        setBands(batchList);

        const profiles: StudentProfile[] = studentData.students ?? [];
        const mapped: StudentRow[] = profiles.map((p) => {
          const band = batchList.find((b) => b.id === p.currentBatchBandId);
          return {
            ...p,
            batchBandCode: band?.code,
            paymentStatus: p.isPaymentCompulsoryThisCycle ? 'overdue' : undefined,
            email: studentData.emailMap?.[p.userId],
          };
        });
        setStudents(mapped);
      })
      .catch(() => setError('Failed to load student data. Please try again.'))
      .finally(() => setLoading(false));
  }, [user, apiFetch]);

  useEffect(() => {
    load();
  }, [load]);

  // Filter logic (client-side)
  const filtered = students.filter((s) => {
    if (filterBand && s.batchBandCode !== filterBand) return false;
    if (filterPayment) {
      if (filterPayment === 'overdue' && !s.isPaymentCompulsoryThisCycle) return false;
      if (filterPayment === 'paid' && s.isPaymentCompulsoryThisCycle) return false;
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        s.fullName.toLowerCase().includes(q) ||
        (s.email ?? '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const bandOptions = [
    { value: '', label: 'All Batches' },
    ...bands.map((b) => ({ value: b.code, label: `Batch ${b.code}` })),
  ];

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-heading text-2xl font-bold text-charcoal">
            Student Management
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {loading ? 'Loading…' : `${students.length} student${students.length !== 1 ? 's' : ''} enrolled`}
          </p>
        </div>
        <Link href="/admin/students/onboard" className="btn-primary flex-shrink-0">
          + Onboard Student
        </Link>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 flex items-center justify-between gap-3">
          <span>{error}</span>
          <button onClick={load} className="underline text-red-700 hover:no-underline flex-shrink-0">
            Retry
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="search"
          placeholder="Search by name or email…"
          className="input flex-1 min-w-[180px]"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <select
          className="input w-auto"
          value={filterBand}
          onChange={(e) => setFilterBand(e.target.value)}
        >
          {bandOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          className="input w-auto"
          value={filterPayment}
          onChange={(e) => setFilterPayment(e.target.value)}
        >
          {PAYMENT_STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* Student list */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
        ) : filtered.length === 0 ? (
          <div className="px-5 py-12 text-center text-gray-400 text-sm">
            {students.length === 0
              ? 'No students enrolled yet.'
              : 'No students match your filters.'}
          </div>
        ) : (
          filtered.map((s) => (
            <div
              key={s.userId}
              className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 hover:bg-gray-50 transition-colors"
            >
              <Avatar name={s.fullName} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-charcoal truncate">
                  {s.fullName}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {s.email ?? 'No email on record'}
                </p>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  {s.batchBandCode && (
                    <span className="text-xs text-gray-400">
                      Batch{' '}
                      <span className="font-medium text-charcoal">
                        {s.batchBandCode}
                      </span>
                    </span>
                  )}
                  {s.consecutiveViolationCount > 0 && (
                    <span className="text-xs text-red-600 font-medium">
                      {s.consecutiveViolationCount} violation
                      {s.consecutiveViolationCount !== 1 ? 's' : ''}
                    </span>
                  )}
                  {!s.onboardingComplete && (
                    <span className="badge badge-warning">Onboarding</span>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <span
                  className={`badge ${paymentBadgeClass(
                    s.isPaymentCompulsoryThisCycle ? 'overdue' : s.paymentStatus
                  )}`}
                >
                  {s.isPaymentCompulsoryThisCycle
                    ? 'Payment Due'
                    : paymentLabel(s.paymentStatus)}
                </span>
                <span className="text-xs text-gray-400">
                  {s.billingRegion === 'abroad' ? 'Abroad' : 'India'}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {!loading && filtered.length > 0 && filtered.length < students.length && (
        <p className="text-xs text-gray-400 text-center">
          Showing {filtered.length} of {students.length} students
        </p>
      )}
    </div>
  );
}
