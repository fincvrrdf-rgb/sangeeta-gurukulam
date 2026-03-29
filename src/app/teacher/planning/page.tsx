/**
 * Lesson Planning List — /teacher/planning
 *
 * Lists lesson plans by month with status badges.
 * Links to monthly plan detail and allows creating new plans.
 */

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthContext } from '@/components/layout/AuthProvider';

type PlanStatus = 'draft' | 'submitted';

interface LessonPlan {
  id: string;
  month: string; // e.g. "2026-03"
  status: PlanStatus;
  itemCount: number;
}

function statusBadgeClass(status: PlanStatus): string {
  return status === 'submitted' ? 'badge badge-success' : 'badge badge-warning';
}

function formatMonth(monthStr: string): string {
  const [year, month] = monthStr.split('-');
  return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });
}

function thisMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 px-5 py-4 animate-pulse">
      <div className="flex-1 space-y-1.5">
        <div className="h-3 w-32 bg-gray-200 rounded" />
        <div className="h-2.5 w-20 bg-gray-200 rounded" />
      </div>
      <div className="h-5 w-16 bg-gray-200 rounded-full" />
    </div>
  );
}

export default function PlanningListPage() {
  const { user, apiFetch } = useAuthContext();
  const router = useRouter();

  const [plans, setPlans] = useState<LessonPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!user) return;
    apiFetch('/api/planning')
      .then((r) => r.json())
      .then((data) => setPlans(Array.isArray(data) ? data : data.plans ?? []))
      .catch((err) => setError(err.message ?? 'Failed to load plans.'))
      .finally(() => setLoading(false));
  }, [user, apiFetch]);

  async function handleCreatePlan() {
    const month = thisMonth();
    const exists = plans.find((p) => p.month === month);
    if (exists) {
      router.push(`/teacher/planning/${month}`);
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const res = await apiFetch('/api/planning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Error ${res.status}`);
      }
      router.push(`/teacher/planning/${month}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create plan.');
      setCreating(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-charcoal">Lesson Planning</h1>
          <p className="text-sm text-gray-500 mt-0.5">Monthly plans and teaching objectives</p>
        </div>
        <button
          onClick={handleCreatePlan}
          disabled={creating}
          className="btn-primary"
        >
          {creating ? 'Creating…' : '+ New Plan'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="card border-red-300 bg-red-50 text-red-800 text-sm flex items-start justify-between gap-2">
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)} className="flex-shrink-0 text-red-500 hover:text-red-700 font-bold">×</button>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="card p-0 divide-y divide-gray-100">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} />)}
        </div>
      ) : plans.length === 0 ? (
        <div className="card flex flex-col items-center py-16 text-center">
          <span className="text-4xl mb-3">📅</span>
          <p className="text-gray-600 font-medium">No lesson plans yet</p>
          <p className="text-gray-400 text-sm mt-1">
            Create your first monthly plan to get started.
          </p>
          <button onClick={handleCreatePlan} disabled={creating} className="btn-primary mt-4">
            {creating ? 'Creating…' : 'Create Plan'}
          </button>
        </div>
      ) : (
        <div className="card p-0 divide-y divide-gray-100">
          {/* Column headers */}
          <div className="hidden sm:grid grid-cols-[1fr_auto_auto_auto] gap-4 px-5 py-3 bg-gray-50 rounded-t-xl">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Month</span>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Items</span>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</span>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Action</span>
          </div>

          {plans.map((plan) => (
            <div key={plan.id} className="flex items-center gap-4 px-5 py-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-charcoal">{formatMonth(plan.month)}</p>
                {/* Mobile: items + status */}
                <div className="flex items-center gap-2 mt-1 sm:hidden">
                  <span className="text-xs text-gray-500">{plan.itemCount} item{plan.itemCount !== 1 ? 's' : ''}</span>
                  <span className={statusBadgeClass(plan.status)}>{plan.status}</span>
                </div>
              </div>
              <p className="hidden sm:block text-sm text-gray-500 w-16 flex-shrink-0 text-center">
                {plan.itemCount}
              </p>
              <span className={`hidden sm:inline-flex ${statusBadgeClass(plan.status)}`}>
                {plan.status}
              </span>
              <Link
                href={`/teacher/planning/${plan.month}`}
                className="btn-secondary text-xs flex-shrink-0"
              >
                View
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
