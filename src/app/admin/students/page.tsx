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
  const [waiverStudentId, setWaiverStudentId] = useState<string | null>(null);
  const [waiverReason, setWaiverReason] = useState('');
  const [waiving, setWaiving] = useState(false);
  const [waiverSuccess, setWaiverSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Change Batch
  const [changeBatchId, setChangeBatchId] = useState<string | null>(null);
  const [changeToBatchId, setChangeToBatchId] = useState('');
  const [changingBatch, setChangingBatch] = useState(false);

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

  async function handleWaiveViolation(studentId: string) {
    if (!waiverReason.trim()) return;
    setWaiving(true);
    const cycleMonth = new Date().toISOString().slice(0, 7);
    try {
      const res = await apiFetch('/api/payment/waive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, cycleMonth, reason: waiverReason.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to waive');
      setWaiverSuccess('Violation waived successfully.');
      setWaiverStudentId(null);
      setWaiverReason('');
      load();
      setTimeout(() => setWaiverSuccess(null), 3000);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Could not waive violation.');
    } finally {
      setWaiving(false);
    }
  }

  async function handleToggleActive(studentId: string, makeActive: boolean) {
    setActioningId(studentId);
    try {
      const res = await apiFetch(`/api/admin/students/${studentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: makeActive }),
      });
      if (!res.ok) throw new Error('Failed to update status');
      setStudents((prev) =>
        prev.map((s) => s.userId === studentId ? { ...s, isActive: makeActive } : s)
      );
    } catch {
      alert('Could not update student status.');
    } finally {
      setActioningId(null);
    }
  }

  async function handleDelete(studentId: string) {
    setActioningId(studentId);
    setConfirmDelete(null);
    try {
      const res = await apiFetch(`/api/admin/students/${studentId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      setStudents((prev) => prev.filter((s) => s.userId !== studentId));
    } catch {
      alert('Could not delete student.');
    } finally {
      setActioningId(null);
    }
  }

  async function handleChangeBatch(studentId: string) {
    if (!changeToBatchId) return;
    setChangingBatch(true);
    try {
      const res = await apiFetch(`/api/admin/students/${studentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentBatchBandId: changeToBatchId }),
      });
      if (!res.ok) throw new Error('Failed to change batch');
      const newCode = bands.find((b) => b.id === changeToBatchId)?.code;
      setStudents((prev) =>
        prev.map((s) =>
          s.userId === studentId
            ? { ...s, currentBatchBandId: changeToBatchId, batchBandCode: newCode }
            : s
        )
      );
      setChangeBatchId(null);
      setWaiverSuccess(`Batch updated to Batch ${newCode}.`);
      setTimeout(() => setWaiverSuccess(null), 3000);
    } catch {
      alert('Could not change batch. Please try again.');
    } finally {
      setChangingBatch(false);
    }
  }

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

      {/* Waiver success */}
      {waiverSuccess && (
        <div className="rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800">
          ✅ {waiverSuccess}
        </div>
      )}

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
            <div key={s.userId} className="border-b border-gray-100 last:border-0">
              <div className="flex items-center gap-3 px-5 py-4 hover:bg-gray-50 transition-colors">
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
                        Batch <span className="font-medium text-charcoal">{s.batchBandCode}</span>
                      </span>
                    )}
                    {(s.consecutiveViolationCount ?? 0) > 0 && (
                      <span className="text-xs text-red-600 font-medium">
                        {s.consecutiveViolationCount} violation{s.consecutiveViolationCount !== 1 ? 's' : ''}
                      </span>
                    )}
                    {!s.onboardingComplete && (
                      <span className="badge badge-warning">Onboarding</span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                  <span className={`badge ${paymentBadgeClass(s.isPaymentCompulsoryThisCycle ? 'overdue' : s.paymentStatus)}`}>
                    {s.isPaymentCompulsoryThisCycle ? 'Payment Due' : paymentLabel(s.paymentStatus)}
                  </span>
                  <span className={`text-xs font-medium ${(s as unknown as Record<string,unknown>).isActive === false ? 'text-red-500' : 'text-green-600'}`}>
                    {(s as unknown as Record<string,unknown>).isActive === false ? 'Inactive' : 'Active'}
                  </span>
                  <div className="flex gap-1 mt-0.5">
                    {(s as unknown as Record<string,unknown>).isActive === false ? (
                      <button
                        onClick={() => handleToggleActive(s.userId, true)}
                        disabled={actioningId === s.userId}
                        className="text-xs text-green-600 border border-green-200 rounded px-2 py-0.5 hover:bg-green-50 disabled:opacity-50"
                      >
                        Activate
                      </button>
                    ) : (
                      <button
                        onClick={() => handleToggleActive(s.userId, false)}
                        disabled={actioningId === s.userId}
                        className="text-xs text-orange-600 border border-orange-200 rounded px-2 py-0.5 hover:bg-orange-50 disabled:opacity-50"
                      >
                        Deactivate
                      </button>
                    )}
                    <button
                      onClick={() => setConfirmDelete(s.userId)}
                      disabled={actioningId === s.userId}
                      className="text-xs text-red-600 border border-red-200 rounded px-2 py-0.5 hover:bg-red-50 disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                  <button
                    onClick={() => {
                      setChangeBatchId(changeBatchId === s.userId ? null : s.userId);
                      setChangeToBatchId(s.currentBatchBandId ?? '');
                    }}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Change Batch
                  </button>
                  {(s.isPaymentCompulsoryThisCycle || (s.consecutiveViolationCount ?? 0) > 0) && (
                    <button
                      onClick={() => {
                        setWaiverStudentId(waiverStudentId === s.userId ? null : s.userId);
                        setWaiverReason('');
                      }}
                      className="text-xs text-orange-600 hover:underline"
                    >
                      Waive Violation
                    </button>
                  )}
                </div>
              </div>

              {/* Inline Change Batch panel */}
              {changeBatchId === s.userId && (
                <div className="px-5 pb-4 bg-blue-50 border-t border-blue-100">
                  <p className="text-xs font-semibold text-blue-800 mt-3 mb-2">
                    Change batch for {s.fullName}
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    <select
                      className="input text-xs flex-1"
                      value={changeToBatchId}
                      onChange={(e) => setChangeToBatchId(e.target.value)}
                    >
                      <option value="">— Select batch —</option>
                      {bands.map((b) => (
                        <option key={b.id} value={b.id}>
                          Batch {b.code} — {b.description || b.name}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleChangeBatch(s.userId)}
                      disabled={changingBatch || !changeToBatchId || changeToBatchId === s.currentBatchBandId}
                      className="btn-primary text-xs px-3 whitespace-nowrap disabled:opacity-50"
                    >
                      {changingBatch ? 'Saving…' : 'Confirm'}
                    </button>
                    <button
                      onClick={() => setChangeBatchId(null)}
                      className="btn-secondary text-xs px-3"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Inline waiver form */}
              {waiverStudentId === s.userId && (
                <div className="px-5 pb-4 bg-orange-50 border-t border-orange-100">
                  <p className="text-xs font-semibold text-orange-800 mt-3 mb-2">
                    Override violation for {s.fullName}
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      className="input text-xs flex-1"
                      placeholder="Reason for waiver (e.g. medical, family emergency)…"
                      value={waiverReason}
                      onChange={(e) => setWaiverReason(e.target.value)}
                    />
                    <button
                      onClick={() => handleWaiveViolation(s.userId)}
                      disabled={waiving || !waiverReason.trim()}
                      className="btn-primary text-xs px-3 whitespace-nowrap"
                    >
                      {waiving ? 'Waiving…' : 'Confirm Waiver'}
                    </button>
                    <button
                      onClick={() => setWaiverStudentId(null)}
                      className="btn-secondary text-xs px-3"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {!loading && filtered.length > 0 && filtered.length < students.length && (
        <p className="text-xs text-gray-400 text-center">
          Showing {filtered.length} of {students.length} students
        </p>
      )}

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full space-y-4">
            <h2 className="font-heading text-lg font-bold text-charcoal">Delete Student?</h2>
            <p className="text-sm text-gray-600">
              This will deactivate the student&apos;s account and disable login. Their records are preserved.
              This action can be reversed by reactivating the account.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => handleDelete(confirmDelete)}
                disabled={actioningId === confirmDelete}
                className="btn-primary bg-red-600 hover:bg-red-700 flex-1"
              >
                {actioningId === confirmDelete ? 'Deleting…' : 'Yes, Delete'}
              </button>
              <button
                onClick={() => setConfirmDelete(null)}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
