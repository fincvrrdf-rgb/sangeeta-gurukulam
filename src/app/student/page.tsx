/**
 * Student Dashboard — /student
 *
 * Quick-access card grid to all student features.
 * Fetches payment proof data to surface violation warnings.
 */

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuthContext } from '@/components/layout/AuthProvider';

interface PaymentSummary {
  consecutiveViolations: number;
  currentStatus: string;
}

const QUICK_LINKS = [
  { icon: '🎵', label: 'Join Class', href: '/student/class', primary: true },
  { icon: '🙏', label: 'Join Bhajan', href: '/bhajan', primary: true },
  { icon: '📋', label: 'Mark Absence', href: '/student/absence/mark' },
  { icon: '💰', label: 'Upload Payment', href: '/student/payment/upload' },
  { icon: '📝', label: 'Lyrics', href: '/student/lyrics' },
  { icon: '🎤', label: 'Practice Record', href: '/student/practice' },
  { icon: '🎵', label: 'Riyaz Check-in', href: '/student/riyaz' },
  { icon: '📊', label: 'Weekly Report', href: '/student/reports' },
  { icon: '✅', label: 'Attendance History', href: '/student/attendance' },
  { icon: '📚', label: 'Resources', href: '/student/resources' },
];

function SkeletonCard() {
  return (
    <div className="action-card animate-pulse">
      <div className="w-8 h-8 rounded-full bg-gray-200 mb-2" />
      <div className="h-3 w-20 bg-gray-200 rounded" />
    </div>
  );
}

export default function StudentDashboard() {
  const { user, apiFetch } = useAuthContext();
  const [payment, setPayment] = useState<PaymentSummary | null>(null);
  const [loadingPayment, setLoadingPayment] = useState(true);

  useEffect(() => {
    if (!user) return;
    apiFetch('/api/payment/proof')
      .then((r) => {
        if (!r.ok) throw new Error('API error');
        return r.json();
      })
      .then((data) => {
        if (data?.consecutiveViolations !== undefined) {
          setPayment(data);
        } else {
          setPayment(null);
        }
      })
      .catch(() => setPayment(null))
      .finally(() => setLoadingPayment(false));
  }, [user, apiFetch]);

  const firstName = user?.displayName?.split(' ')[0] ?? 'Student';
  const showViolationWarning =
    !loadingPayment && payment && payment.consecutiveViolations >= 2;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      {/* Greeting */}
      <div>
        <h1 className="font-heading text-2xl font-bold text-charcoal">
          Namaste, {firstName} 🙏
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Welcome to your Sangeeta Gurukulam dashboard.
        </p>
      </div>

      {/* Violation warning banner */}
      {showViolationWarning && (
        <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 flex items-start gap-3">
          <span className="text-xl flex-shrink-0">⚠️</span>
          <div>
            <p className="font-medium text-red-800 text-sm">
              Payment attention required
            </p>
            <p className="text-xs text-red-700 mt-0.5">
              You have{' '}
              <span className="font-semibold">
                {payment!.consecutiveViolations} consecutive payment violations
              </span>
              . Please upload your payment proof to avoid suspension.
            </p>
            <Link
              href="/student/payment/upload"
              className="mt-2 inline-block btn-danger text-xs px-3 py-1.5"
            >
              Upload Now
            </Link>
          </div>
        </div>
      )}

      {/* Today's Bhajan section */}
      <section>
        <h2 className="section-title mb-3">Today&rsquo;s Session</h2>
        <Link
          href="/bhajan"
          className="action-card-primary flex-row justify-between px-5 py-4"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">🙏</span>
            <div className="text-left">
              <p className="font-semibold text-saffron-800 text-sm">
                Daily Bhajan
              </p>
              <p className="text-xs text-saffron-600">
                Free devotional session &mdash; 5:30 PM IST
              </p>
            </div>
          </div>
          <span className="text-saffron-500 text-lg">→</span>
        </Link>
      </section>

      {/* Quick access grid */}
      <section>
        <h2 className="section-title mb-3">Quick Access</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {loadingPayment
            ? Array.from({ length: 10 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))
            : QUICK_LINKS.map(({ icon, label, href, primary }) => (
                <Link
                  key={href}
                  href={href}
                  className={primary ? 'action-card-primary' : 'action-card'}
                >
                  <span className="text-2xl">{icon}</span>
                  <span className="text-xs font-medium text-center text-charcoal leading-tight">
                    {label}
                  </span>
                </Link>
              ))}
        </div>
      </section>

      {/* Payment status shortcut */}
      {!loadingPayment && payment && payment.currentStatus && (
        <section>
          <h2 className="section-title mb-3">Payment Status</h2>
          <Link
            href="/student/payment/status"
            className="card flex items-center justify-between hover:border-saffron-300 transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="text-xl">💰</span>
              <div>
                <p className="text-sm font-medium text-charcoal">
                  This month&rsquo;s payment
                </p>
                <p className="text-xs text-gray-500 capitalize">
                  {payment.currentStatus.replace(/_/g, ' ')}
                </p>
              </div>
            </div>
            <span
              className={`badge ${
                payment.currentStatus === 'approved'
                  ? 'badge-success'
                  : payment.currentStatus === 'pending'
                  ? 'badge-warning'
                  : 'badge-error'
              }`}
            >
              {payment.currentStatus}
            </span>
          </Link>
        </section>
      )}
    </div>
  );
}
