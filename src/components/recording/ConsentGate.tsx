/**
 * ConsentGate — Recording consent wrapper.
 *
 * If the student has not yet given recording consent (checked in localStorage),
 * renders a consent form with an explanation and checkbox.
 * Once consented, renders children.
 */

'use client';

import { useState, useEffect, type ReactNode } from 'react';

const CONSENT_STORAGE_KEY = 'sg_recording_consent';

interface ConsentGateProps {
  onConsent: () => void;
  children: ReactNode;
}

export function ConsentGate({ onConsent, children }: ConsentGateProps) {
  // null = not yet checked (hydrating), true = consented, false = not consented
  const [consented, setConsented] = useState<boolean | null>(null);
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);

  // Read from localStorage on mount (client only)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(CONSENT_STORAGE_KEY);
      setConsented(stored === 'true');
    } catch {
      setConsented(false);
    }
  }, []);

  function handleAgree() {
    if (!checked) return;
    setSaving(true);
    try {
      localStorage.setItem(CONSENT_STORAGE_KEY, 'true');
    } catch {
      // localStorage may be unavailable in some environments; proceed anyway
    }
    setConsented(true);
    onConsent();
    setSaving(false);
  }

  // Still hydrating
  if (consented === null) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-6 w-6 rounded-full border-2 border-saffron-400 border-t-transparent animate-spin" />
      </div>
    );
  }

  // Already consented — render children
  if (consented) {
    return <>{children}</>;
  }

  // Show consent form
  return (
    <div className="max-w-lg mx-auto">
      <div className="card space-y-5">
        {/* Icon */}
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-saffron-100 flex items-center justify-center">
            <svg
              className="w-5 h-5 text-saffron-700"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
              />
            </svg>
          </div>
          <div>
            <h2 className="section-title text-base">Recording Consent</h2>
            <p className="text-xs text-gray-500 mt-0.5">Required before recording</p>
          </div>
        </div>

        {/* Explanation */}
        <div className="rounded-lg bg-blue-50 border border-blue-200 p-4 text-sm text-blue-900 leading-relaxed">
          By recording, you agree that your practice recordings will be stored securely
          and shared only with your teacher for feedback.
        </div>

        <ul className="text-sm text-gray-600 space-y-2 pl-1">
          <li className="flex gap-2 items-start">
            <span className="text-green-600 mt-0.5 flex-shrink-0">&#10003;</span>
            Recordings are stored securely in Firebase Storage.
          </li>
          <li className="flex gap-2 items-start">
            <span className="text-green-600 mt-0.5 flex-shrink-0">&#10003;</span>
            Only your teacher can access your recordings.
          </li>
          <li className="flex gap-2 items-start">
            <span className="text-green-600 mt-0.5 flex-shrink-0">&#10003;</span>
            Recordings are automatically deleted after the retention period.
          </li>
        </ul>

        {/* Checkbox */}
        <label className="flex items-start gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-saffron-600 cursor-pointer"
          />
          <span className="text-sm text-charcoal">
            I understand and agree to the recording consent described above.
          </span>
        </label>

        {/* CTA */}
        <button
          onClick={handleAgree}
          disabled={!checked || saving}
          className="btn-primary w-full"
        >
          {saving ? (
            <>
              <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
              Saving…
            </>
          ) : (
            'I Understand & Agree'
          )}
        </button>
      </div>
    </div>
  );
}
