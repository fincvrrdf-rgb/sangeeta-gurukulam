/**
 * Payment Overview — /teacher/payment
 *
 * Lists payment proofs awaiting review (status: 'submitted').
 * Each row links to the detailed review page.
 */

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuthContext } from '@/components/layout/AuthProvider';

interface PaymentProof {
  id: string;
  studentId: string;
  studentName: string;
  cycleMonth: string;   // e.g. "2026-03"
  submittedAt: string;  // ISO timestamp
  fileType: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf' | string;
  status: 'submitted' | 'approved' | 'rejected';
}

function fileTypeLabel(fileType: string): string {
  if (fileType.startsWith('image/')) return 'Image';
  if (fileType === 'application/pdf') return 'PDF';
  return fileType;
}

function fileTypeBadge(fileType: string): string {
  if (fileType.startsWith('image/')) return 'badge badge-info';
  if (fileType === 'application/pdf') return 'badge bg-orange-100 text-orange-800';
  return 'badge badge-neutral';
}

function formatMonth(ym: string): string {
  const [year, month] = ym.split('-');
  return new Date(parseInt(year), parseInt(month) - 1, 1).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 px-5 py-4 animate-pulse">
      <div className="w-9 h-9 rounded-full bg-gray-200 flex-shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3 w-32 bg-gray-200 rounded" />
        <div className="h-2.5 w-20 bg-gray-200 rounded" />
      </div>
      <div className="h-5 w-14 bg-gray-200 rounded-full" />
      <div className="h-7 w-20 bg-gray-200 rounded-lg" />
    </div>
  );
}

export default function PaymentOverviewPage() {
  const { user, apiFetch } = useAuthContext();

  const [proofs, setProofs] = useState<PaymentProof[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    apiFetch('/api/payment/proof?status=submitted')
      .then((r) => r.json())
      .then((data) => setProofs(Array.isArray(data) ? data : data.proofs ?? []))
      .catch((err) => setError(err.message ?? 'Failed to load payment proofs.'))
      .finally(() => setLoading(false));
  }, [user, apiFetch]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-charcoal">Payment Proofs</h1>
          <p className="text-sm text-gray-500 mt-0.5">Review submitted payment evidence</p>
        </div>
        {!loading && proofs.length > 0 && (
          <span className="badge badge-warning text-sm px-3 py-1">
            {proofs.length} pending
          </span>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="card border-red-300 bg-red-50 text-red-800 text-sm">
          ⚠️ {error}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="card p-0 divide-y divide-gray-100">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : proofs.length === 0 ? (
        <div className="card flex flex-col items-center py-16 text-center">
          <span className="text-4xl mb-3">💰</span>
          <p className="text-gray-600 font-medium">All caught up!</p>
          <p className="text-gray-400 text-sm mt-1">No payment proofs are awaiting review.</p>
        </div>
      ) : (
        <div className="card p-0 divide-y divide-gray-100">
          {/* Table header — hidden on mobile, shown on sm+ */}
          <div className="hidden sm:grid grid-cols-[1fr_auto_auto_auto] gap-4 px-5 py-3 bg-gray-50 rounded-t-xl">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Student</span>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Month</span>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Submitted</span>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">File</span>
          </div>

          {proofs.map((proof) => (
            <Link
              key={proof.id}
              href={`/teacher/payment/proof/${proof.id}`}
              className="flex items-center gap-4 px-5 py-4 hover:bg-saffron-50 transition-colors group"
            >
              {/* Avatar */}
              <div className="w-9 h-9 rounded-full bg-saffron-100 flex items-center justify-center flex-shrink-0">
                <span className="text-sm font-bold text-saffron-700">
                  {proof.studentName.charAt(0).toUpperCase()}
                </span>
              </div>

              {/* Student + Meta */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-charcoal truncate group-hover:text-saffron-700 transition-colors">
                  {proof.studentName}
                </p>
                <p className="text-xs text-gray-500 sm:hidden mt-0.5">
                  {formatMonth(proof.cycleMonth)} · {formatDate(proof.submittedAt)}
                </p>
              </div>

              {/* Month (sm+) */}
              <p className="hidden sm:block text-sm text-gray-700 w-28 flex-shrink-0">
                {formatMonth(proof.cycleMonth)}
              </p>

              {/* Submitted date (sm+) */}
              <p className="hidden sm:block text-xs text-gray-500 w-28 flex-shrink-0">
                {formatDate(proof.submittedAt)}
              </p>

              {/* File type badge */}
              <span className={fileTypeBadge(proof.fileType)}>
                {fileTypeLabel(proof.fileType)}
              </span>

              {/* Chevron */}
              <span className="text-gray-300 group-hover:text-saffron-400 transition-colors flex-shrink-0">
                →
              </span>
            </Link>
          ))}
        </div>
      )}

      {/* Info note */}
      {!loading && proofs.length > 0 && (
        <p className="text-xs text-gray-400 text-center">
          Tap a row to open the proof and approve or reject it.
        </p>
      )}
    </div>
  );
}
