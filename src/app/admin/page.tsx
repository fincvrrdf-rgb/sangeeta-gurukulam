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
  {
    icon: '🎤',
    label: 'Bhajan Sessions',
    href: '/teacher/bhajan',
    description: 'Go live for bhajan sessions',
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
  const [seedingBatches, setSeedingBatches] = useState(false);
  const [seedMsg, setSeedMsg] = useState<string | null>(null);
  const [batchCount, setBatchCount] = useState<number | null>(null);

  const seedBatches = async () => {
    setSeedingBatches(true);
    setSeedMsg(null);
    try {
      const r = await apiFetch('/api/admin/batches', { method: 'POST', body: JSON.stringify({ seed: true }) });
      const data = await r.json();
      if (data.success) {
        setSeedMsg(data.created > 0 ? `Created ${data.created} batch(es). Refresh to see them.` : 'All batches already exist.');
        setBatchCount((prev) => (prev ?? 0) + (data.created ?? 0));
      } else {
        setSeedMsg(data.error ?? 'Seeding failed.');
      }
    } catch {
      setSeedMsg('Network error. Try again.');
    } finally {
      setSeedingBatches(false);
    }
  };

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
      apiFetch('/api/admin/students').then((r) => r.json()),
      apiFetch('/api/admin/teachers').then((r) => r.json()),
    ])
      .then(([batchData, studentData, teacherData]) => {
        const allBatches = batchData.batches ?? [];
        const activeBatches = allBatches.filter(
          (b: { isActive?: boolean }) => b.isActive
        ).length;
        setBatchCount(allBatches.length);
        const totalStudents = (studentData.students ?? []).length;
        const totalTeachers = (teacherData.teachers ?? []).length;
        setStats({
          totalStudents,
          totalTeachers,
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

      {/* Setup Checklist — shown only when something needs attention */}
      {batchCount === 0 && (
        <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">⚠️</span>
            <h2 className="font-semibold text-amber-900 text-sm">First-time setup needed</h2>
          </div>
          <div className="space-y-2 text-sm text-amber-800">
            <div className="flex items-start gap-3">
              <span className={batchCount !== null && batchCount > 0 ? 'text-green-600' : 'text-amber-600'}>
                {batchCount !== null && batchCount > 0 ? '✓' : '○'}
              </span>
              <div>
                <p className="font-medium">Create batch bands (A, B, C, D)</p>
                <p className="text-xs text-amber-700">Students need batches to select when they sign up.</p>
                {batchCount === 0 && (
                  <div className="mt-1.5 flex items-center gap-2">
                    <button
                      onClick={seedBatches}
                      disabled={seedingBatches}
                      className="text-xs bg-amber-700 text-white px-3 py-1 rounded-lg hover:bg-amber-800 disabled:opacity-50"
                    >
                      {seedingBatches ? 'Creating…' : 'Create Batches A–D'}
                    </button>
                    {seedMsg && <span className="text-xs text-amber-900">{seedMsg}</span>}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-amber-600">○</span>
              <div>
                <p className="font-medium">Generate class instances for this week</p>
                <p className="text-xs text-amber-700">Go to Teacher &rarr; Classes &rarr; click &ldquo;Auto-Schedule&rdquo;. Meet links are pre-filled.</p>
                <Link href="/teacher/classes" className="inline-block mt-1 text-xs bg-amber-700 text-white px-3 py-1 rounded-lg hover:bg-amber-800">
                  Go to Teacher Classes
                </Link>
              </div>
            </div>
          </div>
        </section>
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
