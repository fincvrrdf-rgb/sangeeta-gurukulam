/**
 * Upload Payment Proof — /student/payment/upload
 *
 * Lets the student upload a payment screenshot or PDF receipt.
 * File is uploaded to Firebase Storage at /payment_proofs/{uid}/{month}/{filename},
 * then the download URL and metadata are POSTed to /api/payment/proof.
 */

'use client';

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebase/client';
import { useAuthContext } from '@/components/layout/AuthProvider';

type UploadStage = 'idle' | 'uploading' | 'saving' | 'success' | 'error';

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function monthOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    options.push({ value, label });
  }
  return options;
}

export default function UploadPaymentPage() {
  const { user, apiFetch } = useAuthContext();

  const [cycleMonth, setCycleMonth] = useState(currentMonth());
  const [paymentType, setPaymentType] = useState<'regular' | 'donation'>('regular');
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState<UploadStage>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const months = monthOptions();

  // Reset state on unmount (handles fast navigation)
  useEffect(() => () => { setStage('idle'); }, []);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null;
    setFileError(null);
    setFile(null);

    if (!selected) return;

    if (!ACCEPTED_TYPES.includes(selected.type)) {
      setFileError('Only JPEG, PNG, WebP, or PDF files are accepted.');
      return;
    }
    if (selected.size > MAX_FILE_BYTES) {
      setFileError('File must be under 10 MB.');
      return;
    }
    setFile(selected);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file || !user) return;

    setStage('uploading');
    setErrorMsg(null);
    setProgress(0);

    try {
      // 1. Upload to Firebase Storage
      const ext = file.name.split('.').pop() ?? 'bin';
      const storageRef = ref(
        storage,
        `payment_proofs/${user.uid}/${cycleMonth}/${Date.now()}.${ext}`
      );

      const uploadTask = uploadBytesResumable(storageRef, file, {
        contentType: file.type,
      });

      const downloadURL: string = await new Promise((resolve, reject) => {
        uploadTask.on(
          'state_changed',
          (snap) => {
            setProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100));
          },
          reject,
          async () => {
            const url = await getDownloadURL(uploadTask.snapshot.ref);
            resolve(url);
          }
        );
      });

      // 2. Save metadata to API
      setStage('saving');
      const res = await apiFetch('/api/payment/proof', {
        method: 'POST',
        body: JSON.stringify({
          cycleMonth,
          fileUrl: downloadURL,
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
          paymentType,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Server error (${res.status})`);
      }

      setStage('success');
      setFile(null);
      setProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: unknown) {
      setStage('error');
      setErrorMsg(
        err instanceof Error ? err.message : 'Upload failed. Please try again.'
      );
    }
  }

  const isSubmitting = stage === 'uploading' || stage === 'saving';

  return (
    <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-heading text-2xl font-bold text-charcoal">
          Upload Payment Proof
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Submit a screenshot or PDF of your payment receipt for the teacher to review.
        </p>
      </div>

      {/* Payment Details */}
      <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-4 space-y-3">
        <p className="text-sm font-semibold text-green-900">Where to Pay</p>

        {/* UPI */}
        <div className="bg-white rounded-lg border border-green-200 px-3 py-2">
          <p className="text-xs font-medium text-gray-600 mb-1">UPI (Recommended)</p>
          <p className="font-mono text-sm text-charcoal font-semibold">9347idfc@axl</p>
          <p className="text-xs text-gray-500 mt-0.5">or <span className="font-mono">9347331601@idfcfirst</span></p>
        </div>

        {/* Bank Transfer */}
        <div className="bg-white rounded-lg border border-green-200 px-3 py-2 space-y-1">
          <p className="text-xs font-medium text-gray-600 mb-1">Bank Transfer — Regular Fee</p>
          <p className="text-xs text-charcoal"><span className="text-gray-500">Name: </span>Dr.(Mrs.) AISHWARYA SUKUMARAN NAIR</p>
          <p className="text-xs text-charcoal"><span className="text-gray-500">Account: </span>10082972125</p>
          <p className="text-xs text-charcoal"><span className="text-gray-500">IFSC: </span>IDFB0080224 &nbsp;·&nbsp; <span className="text-gray-500">SWIFT: </span>IDFBINBBMUM</p>
          <p className="text-xs text-charcoal"><span className="text-gray-500">Bank: </span>IDFC FIRST — East Marredpally Branch</p>
        </div>

        {/* Donation account */}
        <div className="bg-white rounded-lg border border-green-200 px-3 py-2 space-y-1">
          <p className="text-xs font-medium text-gray-600 mb-1">Bank Transfer — Donations / Institutional</p>
          <p className="text-xs text-charcoal"><span className="text-gray-500">Name: </span>CVR RESEARCH AND DEVELOPMENT FOUNDATION</p>
          <p className="text-xs text-charcoal"><span className="text-gray-500">Account: </span>10267504385</p>
          <p className="text-xs text-charcoal"><span className="text-gray-500">IFSC: </span>IDFB0080201 &nbsp;·&nbsp; <span className="text-gray-500">SWIFT: </span>IDFBINBBMUM</p>
          <p className="text-xs text-charcoal"><span className="text-gray-500">Bank: </span>IDFC FIRST — Hyderabad (Jubilee Town) Branch</p>
        </div>

        <p className="text-[10px] text-green-700">
          After making the payment, upload your screenshot or PDF receipt below.
        </p>
      </div>

      {/* Info box */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 flex gap-3">
        <span className="text-lg flex-shrink-0">&#x2139;&#xFE0F;</span>
        <div className="text-sm text-blue-800 space-y-1">
          <p className="font-semibold">Accepted formats</p>
          <p>JPEG, PNG, WebP image or PDF &mdash; maximum 10 MB.</p>
          <p>Your teacher will review and confirm within 1&ndash;2 business days.</p>
        </div>
      </div>

      {/* Success state */}
      {stage === 'success' && (
        <div className="rounded-xl border border-green-300 bg-green-50 px-4 py-3 flex gap-3">
          <span className="text-lg">&#x2705;</span>
          <div>
            <p className="font-semibold text-green-800 text-sm">
              Payment proof uploaded successfully
            </p>
            <p className="text-xs text-green-700 mt-0.5">
              Your teacher has been notified and will review it shortly.
            </p>
          </div>
        </div>
      )}

      {/* Donation banner */}
      <div className="rounded-xl border border-saffron-200 bg-saffron-50 px-4 py-3 text-sm text-saffron-800">
        <p className="font-semibold mb-1">💛 Donate to support the Gurukulam</p>
        <p className="text-xs">
          Payment is optional unless you have missed classes. You are always welcome to donate any amount to support the academy&apos;s mission.
          Select &quot;Donation&quot; below if you wish to contribute voluntarily.
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="card space-y-5">
        {/* Payment type */}
        <div>
          <label className="block text-sm font-medium text-charcoal mb-1.5">Payment type</label>
          <div className="flex gap-4">
            {([
              { value: 'regular', label: 'Regular / Compulsory' },
              { value: 'donation', label: '💛 Voluntary Donation' },
            ] as const).map(({ value, label }) => (
              <label key={value} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="paymentType"
                  value={value}
                  checked={paymentType === value}
                  onChange={() => setPaymentType(value)}
                  className="accent-saffron-600"
                  disabled={isSubmitting}
                />
                <span className="text-sm">{label}</span>
              </label>
            ))}
          </div>
          {paymentType === 'donation' && (
            <p className="text-xs text-saffron-700 mt-1">
              Thank you! Donations are acknowledged but do not clear compulsory payment obligations.
            </p>
          )}
        </div>

        {/* Month selector */}
        <div>
          <label
            htmlFor="cycleMonth"
            className="block text-sm font-medium text-charcoal mb-1.5"
          >
            Payment month <span className="text-red-500">*</span>
          </label>
          <select
            id="cycleMonth"
            className="input"
            value={cycleMonth}
            onChange={(e) => setCycleMonth(e.target.value)}
            disabled={isSubmitting}
            required
          >
            {months.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {/* File upload */}
        <div>
          <label
            htmlFor="proofFile"
            className="block text-sm font-medium text-charcoal mb-1.5"
          >
            Receipt / screenshot <span className="text-red-500">*</span>
          </label>
          <input
            id="proofFile"
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES.join(',')}
            className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4
                       file:rounded-lg file:border-0 file:text-sm file:font-medium
                       file:bg-saffron-50 file:text-saffron-700
                       hover:file:bg-saffron-100 cursor-pointer
                       border border-gray-300 rounded-lg px-2 py-1.5"
            onChange={handleFileChange}
            disabled={isSubmitting}
          />
          {fileError && (
            <p className="text-xs text-red-600 mt-1">{fileError}</p>
          )}
          {file && !fileError && (
            <p className="text-xs text-green-700 mt-1">
              &#x2714; {file.name} ({(file.size / 1024).toFixed(0)} KB)
            </p>
          )}
        </div>

        {/* Progress bar */}
        {(stage === 'uploading' || stage === 'saving') && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-gray-500">
              <span>
                {stage === 'uploading' ? `Uploading… ${progress}%` : 'Saving record…'}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
              <div
                className="bg-saffron-500 h-2 rounded-full transition-all duration-300"
                style={{
                  width: stage === 'saving' ? '100%' : `${progress}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* Error */}
        {stage === 'error' && errorMsg && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
            &#9888;&#65039; {errorMsg}
          </p>
        )}

        {/* Submit */}
        <button
          type="submit"
          className="btn-primary w-full"
          disabled={isSubmitting || !file || !!fileError}
        >
          {stage === 'uploading'
            ? `Uploading… ${progress}%`
            : stage === 'saving'
            ? 'Saving…'
            : 'Upload Proof'}
        </button>
      </form>
    </div>
  );
}
