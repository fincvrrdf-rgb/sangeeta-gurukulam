/**
 * Teacher Dashboard — /teacher
 *
 * Stats overview, quick-action cards, and recent activity feed.
 */

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuthContext } from '@/components/layout/AuthProvider';

interface DashboardStats {
  todayClasses: number;
  pendingRecordings: number;
  unpublishedReports: number;
  paymentProofsAwaiting: number;
}

interface RecentActivity {
  id: string;
  studentName: string;
  status: 'present' | 'late' | 'absent' | 'did_not_show';
  className: string;
  markedAt: string;
}

const QUICK_ACTIONS = [
  { icon: '✅', label: 'Mark Attendance', href: '/teacher/classes', primary: true },
  { icon: '🎵', label: 'Review Recordings', href: '/teacher/recordings', primary: true },
  { icon: '📝', label: 'Manage Lyrics', href: '/teacher/lyrics' },
  { icon: '📊', label: 'Grade Students', href: '/teacher/assessments' },
  { icon: '📅', label: 'Manage Classes', href: '/teacher/classes' },
  { icon: '🙏', label: 'Bhajan Session', href: '/teacher/bhajan' },
];

function statusBadgeClass(status: RecentActivity['status']) {
  switch (status) {
    case 'present':      return 'badge badge-success';
    case 'late':         return 'badge badge-warning';
    case 'absent':       return 'badge badge-error';
    case 'did_not_show': return 'badge badge-neutral';
    default:             return 'badge badge-neutral';
  }
}

function statusLabel(status: RecentActivity['status']) {
  if (status === 'did_not_show') return 'Did Not Show';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function StatCardSkeleton() {
  return (
    <div className="card animate-pulse space-y-2">
      <div className="h-3 w-24 bg-gray-200 rounded" />
      <div className="h-8 w-12 bg-gray-200 rounded" />
    </div>
  );
}

function ActivitySkeleton() {
  return (
    <div className="flex items-center gap-3 py-3 animate-pulse">
      <div className="w-8 h-8 rounded-full bg-gray-200 flex-shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3 w-32 bg-gray-200 rounded" />
        <div className="h-2.5 w-20 bg-gray-200 rounded" />
      </div>
      <div className="h-5 w-14 bg-gray-200 rounded-full" />
    </div>
  );
}

export default function TeacherDashboard() {
  const { user, apiFetch } = useAuthContext();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activity, setActivity] = useState<RecentActivity[]>([]);
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingActivity, setLoadingActivity] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);

  const firstName = user?.displayName?.split(' ')[0] ?? 'Teacher';

  useEffect(() => {
    if (!user) return;

    apiFetch('/api/teacher/dashboard/stats')
      .then((r) => r.json())
      .then((data) => setStats(data))
      .catch(() => setStatsError('Could not load stats.'))
      .finally(() => setLoadingStats(false));

    apiFetch('/api/attendance/mark?limit=5&sort=desc')
      .then((r) => r.json())
      .then((data) => setActivity(Array.isArray(data) ? data : data.records ?? []))
      .catch(() => setActivity([]))
      .finally(() => setLoadingActivity(false));
  }, [user, apiFetch]);

  const STAT_CARDS = [
    {
      label: "Today's Classes",
      value: stats?.todayClasses ?? 0,
      icon: '📅',
      color: 'text-saffron-700',
      href: '/teacher/classes',
    },
    {
      label: 'Pending Recordings',
      value: stats?.pendingRecordings ?? 0,
      icon: '🎵',
      color: 'text-teal-700',
      href: '/teacher/recordings',
    },
    {
      label: 'Unpublished Reports',
      value: stats?.unpublishedReports ?? 0,
      icon: '📋',
      color: 'text-purple-700',
      href: '/teacher/reports',
    },
    {
      label: 'Payment Proofs',
      value: stats?.paymentProofsAwaiting ?? 0,
      icon: '💰',
      color: 'text-emerald-700',
      href: '/teacher/payment',
    },
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-0">
      {/* Peacock header */}
      <div
        className="px-5 py-7 text-white"
        style={{ background: 'linear-gradient(135deg, #0a1628 0%, #0d3b2e 50%, #1a4a3a 100%)' }}
      >
        <h1 className="font-heading text-2xl font-bold">
          Namaste, {firstName} 🙏
        </h1>
        <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.7)' }}>
          Sangeeta Gurukulam — Teacher Portal
        </p>
        <div className="mt-3 flex items-center gap-2">
          <div className="h-0.5 flex-1 rounded" style={{ background: 'rgba(34,197,94,0.4)' }} />
          <span className="text-xs" style={{ color: '#22c55e' }}>सङ्गीत गुरुकुलम्</span>
          <div className="h-0.5 flex-1 rounded" style={{ background: 'rgba(34,197,94,0.4)' }} />
        </div>
      </div>

      <div className="px-4 py-8 space-y-8">

      {/* Stats */}
      <section>
        <h2 className="section-title mb-3">Overview</h2>
        {statsError ? (
          <div className="card border-red-300 bg-red-50 text-red-800 text-sm">
            ⚠️ {statsError}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {loadingStats
              ? Array.from({ length: 4 }).map((_, i) => (
                  <StatCardSkeleton key={i} />
                ))
              : STAT_CARDS.map(({ label, value, icon, color, href }) => (
                  <Link key={label} href={href} className="card hover:border-saffron-300 transition-colors">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">{icon}</span>
                      <p className="text-xs text-gray-500 leading-tight">{label}</p>
                    </div>
                    <p className={`text-3xl font-bold ${color}`}>{value}</p>
                    {value > 0 && (
                      <p className="text-xs text-saffron-600 mt-1 font-medium">Needs attention →</p>
                    )}
                  </Link>
                ))}
          </div>
        )}
      </section>

      {/* Quick Actions */}
      <section>
        <h2 className="section-title mb-3">Quick Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {QUICK_ACTIONS.map(({ icon, label, href, primary }) => (
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

      {/* Recent Activity */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="section-title">Recent Attendance</h2>
          <Link
            href="/teacher/classes"
            className="text-xs text-saffron-600 font-medium hover:text-saffron-700"
          >
            View all →
          </Link>
        </div>
        <div className="card p-0 divide-y divide-gray-100">
          {loadingActivity ? (
            <div className="px-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <ActivitySkeleton key={i} />
              ))}
            </div>
          ) : activity.length === 0 ? (
            <div className="px-5 py-12 text-center text-gray-400 text-sm">
              No attendance marks yet today.
            </div>
          ) : (
            activity.map((item) => (
              <div key={item.id} className="flex items-center gap-3 px-5 py-3">
                <div className="w-9 h-9 rounded-full bg-saffron-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-saffron-700">
                    {item.studentName.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-charcoal truncate">
                    {item.studentName}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{item.className}</p>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <span className={statusBadgeClass(item.status)}>
                    {statusLabel(item.status)}
                  </span>
                  <span className="text-xs text-gray-400">
                    {formatRelativeTime(item.markedAt)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
      </div>
    </div>
  );
}
