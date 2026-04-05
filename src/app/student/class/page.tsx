/**
 * Student Class Hub — /student/class
 *
 * Landing page linking to Join Class and Book Class.
 */

'use client';

import Link from 'next/link';

export default function ClassPage() {
  return (
    <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-charcoal">Classes</h1>
        <p className="text-sm text-gray-500 mt-1">
          Join your scheduled class or book a makeup session.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <Link
          href="/student/class/join"
          className="action-card-primary flex-row justify-between px-5 py-5"
        >
          <div className="flex items-center gap-4">
            <span className="text-3xl">&#x1F3B5;</span>
            <div className="text-left">
              <p className="font-semibold text-saffron-800 text-base">
                Join Today&apos;s Class
              </p>
              <p className="text-xs text-saffron-600 mt-0.5">
                View today&apos;s schedule and Google Meet links
              </p>
            </div>
          </div>
          <span className="text-saffron-500 text-xl">&#x2192;</span>
        </Link>

        <Link
          href="/student/class/book"
          className="action-card flex-row justify-between px-5 py-5"
        >
          <div className="flex items-center gap-4">
            <span className="text-3xl">&#x1F4C5;</span>
            <div className="text-left">
              <p className="font-semibold text-charcoal text-base">
                Book a Class
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                Schedule a makeup or special session
              </p>
            </div>
          </div>
          <span className="text-gray-400 text-xl">&#x2192;</span>
        </Link>
      </div>
    </div>
  );
}
