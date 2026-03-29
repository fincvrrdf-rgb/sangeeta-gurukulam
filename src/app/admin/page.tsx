/**
 * Admin Dashboard — /admin
 *
 * System stats at a glance, quick-action cards, and settings health indicators.
 */

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuthContext } from '@/components/layout/AuthProvider';

interface SystemStats {
  totalStudents: number;
  totalTeachers: number;
  activeClasses: number;
  pendingPayments: number;
}

interface SettingsHealth {
  violationThreshold: number;
  paymentAmountIndia: number;
  paymentAmountAbroad: number;
  longAbsenceRequiresApproval: boolean;
}

const QUICK_ACTIONS = [
  {
    icon: '📚',
    label: 'Manage Syllabus',
    href: '/admin/syllabus',
    description: 'Lessons, geethams, teaching units',
    primary: true,
  },
  {
    icon: '🎓',
    label: 'Manage Batches',
    href: '/admin/batches',
    description: 'Batch bands A–D, teacher assignments',
    primary: true,
  },
  {
    icon: '👩‍🏫',
    label: 'Manage Teachers',
    href: '/admin/teachers',
    description: 'Teacher profiles and assignments',
    primary: false,
  },
  {
    icon: '🎵',
    label: 'Manage Students',
    href: '/admin/students',
    description: 'Student profiles, onboarding, payment status',
    primary: false,
  },
  {
    icon: '⚙️',
    label: 'App Settings',
    href: '/admin/settings',
    description: 'Thresholds, payment rules, notifications',
    primary: false,
  },
  {
    icon: '📖',
    label: 'Audit Logs',
    href: '/admin/audit-logs',
    description: 'System activity and change history',
    primary: false,
  },
  {
    icon: '🪔',
    label: 'Devotional Calendar',
    href: '/admin/devotional-calendar',
    description: 'Festivals, vrats, observances',
    primary: false,
  },
];

function StatCard({
  label,
  value,
  icon,
  loading,
}: {
  label: string;
  value: number | null;
  icon: string;
  loading: boolean;
}) {
  return (
    <div className="card flex items-center gap-4">
      <span className="text-3xl">{icon}</span>
      <div>
        {loading ? (
          <div className="h-7 w-16 bg-gray-200 animate-pulse rounded mb-1" />
        ) : (
          <p className="text-2xl font-bold font-heading text-charcoal">
            {value ?? '—'}
          </p>
        )}
        <p className="text-xs text-gray-500">{label}</p>
      </div>
    </div>
  );
}

function HealthItem({
  label,
  value,
  ok,
  note,
}: {
  label: string;
  value: string;
  ok: boolean;
  note?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-gray-100 last:border-0">
      <div>
        <p className="text-sm font-medium text-charcoal">{label}</p>
        {note && <p className="text-xs text-gray-500 mt-0.5">{note}</p>}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-sm text-gray-700">{value}</span>
        <span
          className={`inline-block w-2.5 h-2.5 rounded-full ${
            ok ? 'bg-green-500' : 'bg-yellow-500'
          }`}
        />
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const { user, apiFetch } = useAuthContext();
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [health, setHealth] = useState<SettingsHealth | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingHealth, setLoadingHealth] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    // Fetch settings for stats proxy and health indicators
    apiFetch('/api/admin/settings')
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.settings) {
          setHealth({
            violationThreshold: data.settings.consecutiveViolationThreshold,
            paymentAmountIndia: data.settings.compulsoryPaymentAmountIndiaPaise / 100,
            paymentAmountAbroad: data.settings.compulsoryPaymentAmountAbroadPaise / 100,
            longAbsenceRequiresApproval: data.settings.longAbsenceRequiresApproval,
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoadingHealth(false));

    // Fetch batch + syllabus as a proxy for active classes count
    Promise.all([
      apiFetch('/api/admin/batches').then((r) => r.json()),
      apiFetch('/api/admin/syllabus').then((r) => r.json()),
    ])
      .then(([batchData, syllabusData]) => {
        const activeBatches = (batchData.batches ?? []).filter(
          (b: { isActive?: boolean }) => b.isActive
        ).length;
        setStats({
          totalStudents: 0,
          totalTeachers: 0,
          activeClasses: activeBatches,
          pendingPayments: 0,
        });
      })
      .catch(() => setError('Failed to load system stats.'))
      .finally(() => setLoadingStats(false));
  }, [user, apiFetch]);

  const firstName = user?.displayName?.split(' ')[0] ?? 'Admin';

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-10">
      {/* Header */}
      <div>
        <h1 className="font-heading text-2xl font-bold text-charcoal">
          Namaste, {firstName} 🙏
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Sangeeta Gurukulam &mdash; Admin Control Panel
        </p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* System Stats */}
      <section>
        <h2 className="section-title mb-4">System Overview</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label="Total Students"
            value={stats?.totalStudents ?? null}
            icon="🎵"
            loading={loadingStats}
          />
          <StatCard
            label="Teachers"
            value={stats?.totalTeachers ?? null}
            icon="👩‍🏫"
            loading={loadingStats}
          />
          <StatCard
            label="Active Batches"
            value={stats?.activeClasses ?? null}
            icon="🎓"
            loading={loadingStats}
          />
          <StatCard
            label="Pending Payments"
            value={stats?.pendingPayments ?? null}
            icon="💰"
            loading={loadingStats}
          />
        </div>
      </section>

      {/* Quick Actions */}
      <section>
        <h2 className="section-title mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {QUICK_ACTIONS.map(({ icon, label, href, description, primary }) => (
            <Link
              key={href}
              href={href}
              className={primary ? 'action-card-primary' : 'action-card'}
            >
              <span className="text-2xl">{icon}</span>
              <span className="text-xs font-semibold text-center text-charcoal leading-tight">
                {label}
              </span>
              <span className="text-[10px] text-center text-gray-500 leading-tight hidden sm:block">
                {description}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Settings Health */}
      <section>
        <h2 className="section-title mb-4">Settings Health</h2>
        <div className="card">
          {loadingHealth ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-8 bg-gray-100 animate-pulse rounded" />
              ))}
            </div>
          ) : health ? (
            <div>
              <HealthItem
                label="Violation Threshold"
                value={`${health.violationThreshold} consecutive`}
                ok={health.violationThreshold >= 3}
                note="Minimum recommended: 3"
              />
              <HealthItem
                label="Compulsory Payment (India)"
                value={`₹${health.paymentAmountIndia.toLocaleString('en-IN')}`}
                ok={health.paymentAmountIndia > 0}
              />
              <HealthItem
                label="Compulsory Payment (Abroad)"
                value={`₹${health.paymentAmountAbroad.toLocaleString('en-IN')}`}
                ok={health.paymentAmountAbroad > 0}
              />
              <HealthItem
                label="Long Absence Approval"
                value={health.longAbsenceRequiresApproval ? 'Required' : 'Not required'}
                ok={health.longAbsenceRequiresApproval}
                note="Recommended: enabled for accountability"
              />
            </div>
          ) : (
            <p className="text-sm text-gray-500">
              Unable to load settings health.{' '}
              <Link href="/admin/settings" className="text-saffron-600 underline">
                Check settings
              </Link>
            </p>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-2 text-right">
          <Link href="/admin/settings" className="hover:text-saffron-600 transition-colors">
            Edit settings →
          </Link>
        </p>
      </section>
    </div>
  );
}
