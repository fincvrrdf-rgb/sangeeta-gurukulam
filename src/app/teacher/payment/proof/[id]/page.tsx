/**
 * Review Payment Proof — /teacher/payment/proof/[id]
 *
 * Shows proof details, optional AI extraction results, and approve/reject controls.
 */

'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthContext } from '@/components/layout/AuthProvider';

interface AIExtraction {
  payerName?: string;
  amount?: number;       // in paise
  transactionDate?: string;
  confidence: number;    // 0–1
}

interface PaymentProofDetail {
  id: string;
  studentId: string;
  studentName: string;
  cycleMonth: string;
  submittedAt: string;
  fileType: string;
  fileUrl?: string;      // signed URL for display
  status: 'submitted' | 'approved' | 'rejected';
  aiExtraction?: AIExtraction;
  reviewerNotes?: string;
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
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatAmount(paise: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

function confidenceBadge(confidence: number): string {
  if (confidence >= 0.85) return 'badge badge-success';
  if (confidence >= 0.60) return 'badge badge-warning';
  return 'badge badge-error';
}

function confidenceLabel(confidence: number): string {
  if (confidence >= 0.85) return `${Math.round(confidence * 100)}% — High`;
  if (confidence >= 0.60) return `${Math.round(confidence * 100)}% — Medium`;
  return `${Math.round(confidence * 100)}% — Low`;
}

function ProofSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="card space-y-3">
        <div className="h-4 w-48 bg-gray-200 rounded" />
        <div className="h-4 w-32 bg-gray-200 rounded" />
        <div className="h-4 w-40 bg-gray-200 rounded" />
      </div>
      <div className="card h-48 bg-gray-100 rounded-xl" />
      <div className="card space-y-3">
        <div className="h-3 w-24 bg-gray-200 rounded" />
        <div className="h-4 w-full bg-gray-200 rounded" />
        <div className="h-4 w-full bg-gray-200 rounded" />
      </div>
    </div>
  );
}

export default function ReviewProofPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, apiFetch } = useAuthContext();

  const [proof, setProof] = useState<PaymentProofDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState<'approve' | 'reject' | null>(null);
  const [done, setDone] = useState(false);
  const [doneAction, setDoneAction] = useState<'approved' | 'rejected' | null>(null);

  useEffect(() => {
    if (!user || !id) return;
    apiFetch(`/api/payment/proof/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setProof(data);
        setNotes(data.reviewerNotes ?? '');
      })
      .catch((err) => setError(err.message ?? 'Failed to load proof details.'))
      .finally(() => setLoading(false));
  }, [user, id, apiFetch]);

  async function handleReview(action: 'approve' | 'reject') {
    if (!proof) return;
    if (action === 'reject' && !notes.trim()) {
      setError('Please add a note explaining the rejection reason.');
      return;
    }
    setSubmitting(action);
    setError(null);
    try {
      const res = await apiFetch(`/api/payment/proof/${proof.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision: action === 'approve' ? 'approved' : 'rejected',
          notes: notes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? 'Review failed');
      }
      setDoneAction(action === 'approve' ? 'approved' : 'rejected');
      setDone(true);
      setTimeout(() => router.push('/teacher/payment'), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit review. Please try again.');
    } finally {
      setSubmitting(null);
    }
  }

  if (done) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center space-y-4">
        <span className="text-5xl">{doneAction === 'approved' ? '✅' : '❌'}</span>
        <h2 className="font-heading text-xl font-semibold text-charcoal capitalize">
          Proof {doneAction}
        </h2>
        <p className="text-sm text-gray-500">Redirecting to payment overview…</p>
      </div>
    );
  }

  const isReviewed = proof?.status !== 'submitted';

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link href="/teacher/payment" className="text-gray-400 hover:text-gray-600 mt-1 flex-shrink-0">
          ← Back
        </Link>
        <div>
          <h1 className="font-heading text-2xl font-bold text-charcoal">Review Payment Proof</h1>
          {proof && (
            <p className="text-sm text-gray-500 mt-0.5">
              {proof.studentName} · {formatMonth(proof.cycleMonth)}
            </p>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="card border-red-300 bg-red-50 text-red-800 text-sm flex items-start justify-between gap-2">
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)} className="flex-shrink-0 text-red-500 hover:text-red-700 font-bold">×</button>
        </div>
      )}

      {loading ? (
        <ProofSkeleton />
      ) : !proof ? (
        <div className="card flex flex-col items-center py-16 text-center">
          <span className="text-3xl mb-2">🔍</span>
          <p className="text-gray-500 text-sm">Proof not found.</p>
          <Link href="/teacher/payment" className="btn-secondary mt-4">Back to Payment</Link>
        </div>
      ) : (
        <div className="space-y-5">

          {/* Already reviewed banner */}
          {isReviewed && (
            <div className={`card text-sm ${proof.status === 'approved' ? 'border-green-300 bg-green-50 text-green-800' : 'border-red-300 bg-red-50 text-red-800'}`}>
              {proof.status === 'approved' ? '✅' : '❌'} This proof has already been{' '}
              <strong className="capitalize">{proof.status}</strong>.
              {proof.reviewerNotes && (
                <p className="mt-1 text-xs opacity-80">Note: {proof.reviewerNotes}</p>
              )}
            </div>
          )}

          {/* Proof Details */}
          <div className="card space-y-3">
            <h2 className="section-title">Proof Details</h2>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-gray-500">Student</dt>
              <dd className="font-medium text-charcoal">{proof.studentName}</dd>

              <dt className="text-gray-500">Month</dt>
              <dd className="font-medium text-charcoal">{formatMonth(proof.cycleMonth)}</dd>

              <dt className="text-gray-500">Submitted</dt>
              <dd className="font-medium text-charcoal">{formatDate(proof.submittedAt)}</dd>

              <dt className="text-gray-500">File Type</dt>
              <dd>
                <span className={proof.fileType.startsWith('image/') ? 'badge badge-info' : 'badge bg-orange-100 text-orange-800'}>
                  {proof.fileType === 'application/pdf' ? 'PDF' : 'Image'}
                </span>
              </dd>
            </dl>
          </div>

          {/* File Preview */}
          {proof.fileUrl && (
            <div className="card p-0 overflow-hidden">
              {proof.fileType.startsWith('image/') ? (
                <img
                  src={proof.fileUrl}
                  alt="Payment proof"
                  className="w-full h-auto max-h-[480px] object-contain bg-gray-50"
                />
              ) : (
                <div className="flex flex-col items-center justify-center py-12 gap-4 bg-gray-50">
                  <span className="text-4xl">📄</span>
                  <p className="text-sm text-gray-600">PDF document attached</p>
                  <a
                    href={proof.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary"
                  >
                    Open PDF
                  </a>
                </div>
              )}
            </div>
          )}

          {/* AI Extraction */}
          {proof.aiExtraction && (
            <div className="card space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="section-title">AI Extraction</h2>
                <span className={confidenceBadge(proof.aiExtraction.confidence)}>
                  {confidenceLabel(proof.aiExtraction.confidence)}
                </span>
              </div>
              <p className="text-xs text-gray-400">
                Automatically extracted from the uploaded file. Verify before approving.
              </p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                {proof.aiExtraction.payerName && (
                  <>
                    <dt className="text-gray-500">Payer Name</dt>
                    <dd className="font-medium text-charcoal">{proof.aiExtraction.payerName}</dd>
                  </>
                )}
                {proof.aiExtraction.amount != null && (
                  <>
                    <dt className="text-gray-500">Amount</dt>
                    <dd className="font-medium text-charcoal">{formatAmount(proof.aiExtraction.amount)}</dd>
                  </>
                )}
                {proof.aiExtraction.transactionDate && (
                  <>
                    <dt className="text-gray-500">Transaction Date</dt>
                    <dd className="font-medium text-charcoal">{proof.aiExtraction.transactionDate}</dd>
                  </>
                )}
              </dl>
              {proof.aiExtraction.confidence < 0.60 && (
                <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-800">
                  <span className="flex-shrink-0">⚠️</span>
                  Low confidence. Please inspect the file carefully before approving.
                </div>
              )}
            </div>
          )}

          {/* Review Form */}
          {!isReviewed && (
            <div className="card space-y-4">
              <h2 className="section-title">Your Decision</h2>

              <div>
                <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
                  Notes <span className="text-gray-400 font-normal">(required for rejection)</span>
                </label>
                <textarea
                  id="notes"
                  rows={3}
                  placeholder="Optional notes for the student…"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="input resize-none"
                />
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => handleReview('approve')}
                  disabled={submitting !== null}
                  className="btn-primary flex-1"
                >
                  {submitting === 'approve' ? 'Approving…' : '✅ Approve'}
                </button>
                <button
                  onClick={() => handleReview('reject')}
                  disabled={submitting !== null}
                  className="btn-danger flex-1"
                >
                  {submitting === 'reject' ? 'Rejecting…' : '❌ Reject'}
                </button>
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
