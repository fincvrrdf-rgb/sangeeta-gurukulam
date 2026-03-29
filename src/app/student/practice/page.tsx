/**
 * Practice Hub — /student/practice
 *
 * Entry point for the practice section. Quick links to record and history.
 */

'use client';

import Link from 'next/link';

export default function PracticePage() {
  return (
    <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-charcoal">
          Practice
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Record your practice sessions and track teacher feedback.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <Link
          href="/student/practice/record"
          className="action-card-primary flex-row justify-between px-5 py-5"
        >
          <div className="flex items-center gap-4">
            <span className="text-3xl">&#x1F3A4;</span>
            <div className="text-left">
              <p className="font-semibold text-saffron-800 text-base">
                New Recording
              </p>
              <p className="text-xs text-saffron-600 mt-0.5">
                Record and submit for teacher feedback
              </p>
            </div>
          </div>
          <span className="text-saffron-500 text-xl">&#x2192;</span>
        </Link>

        <Link
          href="/student/practice/history"
          className="action-card flex-row justify-between px-5 py-5"
        >
          <div className="flex items-center gap-4">
            <span className="text-3xl">&#x1F4DC;</span>
            <div className="text-left">
              <p className="font-semibold text-charcoal text-base">
                Recording History
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                View past submissions and reviews
              </p>
            </div>
          </div>
          <span className="text-gray-400 text-xl">&#x2192;</span>
        </Link>
      </div>
    </div>
  );
}
