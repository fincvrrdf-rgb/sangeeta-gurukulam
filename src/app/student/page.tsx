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

interface StudentProfile {
  currentBatchBandId?: string;
  onboardingComplete?: boolean;
}

const QUICK_LINKS = [
  { icon: '🎵', label: 'Join Class', href: '/student/class/join', primary: true },
  { icon: '🙏', label: 'Join Bhajan', href: '/student/bhajan', primary: true },
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
  const [profile, setProfile] = useState<StudentProfile | null>(null);

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

    apiFetch('/api/student/profile')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setProfile(data))
      .catch(() => null);
  }, [user, apiFetch]);

  const firstName = user?.displayName?.split(' ')[0] ?? 'Student';
  const showViolationWarning =
    !loadingPayment && payment && payment.consecutiveViolations >= 2;

  return (
    <div className="max-w-2xl mx-auto space-y-0">
      {/* Peacock header banner */}
      <div
        className="px-5 py-7 text-white"
        style={{ background: 'linear-gradient(135deg, #0a1628 0%, #0d3b2e 50%, #1a4a3a 100%)' }}
      >
        <h1 className="font-heading text-2xl font-bold">
          Namaste, {firstName} 🙏
        </h1>
        <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.7)' }}>
          Sangeeta Gurukulam — Carnatic Music Education
        </p>
        <div className="mt-3 flex items-center gap-2">
          <div className="h-0.5 flex-1 rounded" style={{ background: 'rgba(34,197,94,0.4)' }} />
          <span className="text-xs" style={{ color: '#22c55e' }}>सङ्गीत गुरुकुलम्</span>
          <div className="h-0.5 flex-1 rounded" style={{ background: 'rgba(34,197,94,0.4)' }} />
        </div>
      </div>

      <div className="px-4 py-6 space-y-8">

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

      {/* Onboarding banner — shown when no batch selected */}
      {profile !== null && !profile.currentBatchBandId && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 flex items-start gap-3">
          <span className="text-xl flex-shrink-0">🎵</span>
          <div className="flex-1">
            <p className="font-medium text-amber-900 text-sm">Complete your setup</p>
            <p className="text-xs text-amber-800 mt-0.5">
              Please select your class batch to start joining classes.
            </p>
            <Link href="/student/onboarding" className="mt-2 inline-block btn-primary text-xs px-3 py-1.5">
              Select Batch
            </Link>
          </div>
        </div>
      )}

      {/* Today's Bhajan section */}
      <section>
        <h2 className="section-title mb-3">Today&rsquo;s Session</h2>
        <Link
          href="/student/bhajan"
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

        {/* YouTube channel link */}
        <a
          href="http://www.youtube.com/@SangeetaGurukulam"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 hover:bg-red-100 transition-colors"
        >
          <span className="text-xl flex-shrink-0">▶️</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-red-800">
              Sangeeta Gurukulam — YouTube Channel
            </p>
            <p className="text-xs text-red-600 truncate">
              youtube.com/@SangeetaGurukulam &nbsp;·&nbsp; Bhajan replays &amp; performances
            </p>
          </div>
          <span className="text-red-400 text-sm flex-shrink-0">↗</span>
        </a>
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
    </div>
  );
}
