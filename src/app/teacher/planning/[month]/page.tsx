/**
 * Monthly Lesson Plan Detail — /teacher/planning/[month]
 *
 * Shows plan items grouped by week.
 * Allows adding new items inline.
 */

'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthContext } from '@/components/layout/AuthProvider';

interface PlanItem {
  id: string;
  week: number; // 1–4 (or 5)
  teachingUnit: string;
  objectives: string;
  activities: string;
}

interface MonthlyPlan {
  id: string;
  month: string;
  status: 'draft' | 'submitted';
  items: PlanItem[];
}

interface AddItemForm {
  week: string;
  teachingUnit: string;
  objectives: string;
  activities: string;
}

const EMPTY_FORM: AddItemForm = {
  week: '1',
  teachingUnit: '',
  objectives: '',
  activities: '',
};

function formatMonth(monthStr: string): string {
  const [year, month] = monthStr.split('-');
  return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });
}

function groupByWeek(items: PlanItem[]): Map<number, PlanItem[]> {
  const map = new Map<number, PlanItem[]>();
  for (const item of items) {
    const list = map.get(item.week) ?? [];
    list.push(item);
    map.set(item.week, list);
  }
  return map;
}

export default function MonthlyPlanPage() {
  const { user, apiFetch } = useAuthContext();
  const params = useParams();
  const router = useRouter();
  const month = params.month as string;

  const [plan, setPlan] = useState<MonthlyPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState<AddItemForm>(EMPTY_FORM);
  const [addingItem, setAddingItem] = useState(false);

  useEffect(() => {
    if (!user) return;
    apiFetch(`/api/planning/${month}`)
      .then((r) => r.json())
      .then((data: MonthlyPlan) => setPlan(data))
      .catch((err) => setError(err.message ?? 'Failed to load plan.'))
      .finally(() => setLoading(false));
  }, [user, apiFetch, month]);

  function flash(msg: string) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3000);
  }

  function setField(field: keyof AddItemForm) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setAddForm((prev) => ({ ...prev, [field]: e.target.value }));
  }

  async function handleAddItem(e: FormEvent) {
    e.preventDefault();
    if (!addForm.teachingUnit.trim()) {
      setError('Teaching unit is required.');
      return;
    }
    setAddingItem(true);
    setError(null);
    try {
      const res = await apiFetch('/api/planning/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: plan?.id,
          month,
          week: parseInt(addForm.week),
          teachingUnit: addForm.teachingUnit,
          objectives: addForm.objectives,
          activities: addForm.activities,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Error ${res.status}`);
      }
      const newItem: PlanItem = await res.json();
      setPlan((prev) =>
        prev ? { ...prev, items: [...prev.items, newItem] } : prev
      );
      setAddForm(EMPTY_FORM);
      setShowAddForm(false);
      flash('Item added.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add item.');
    } finally {
      setAddingItem(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
        <div className="h-7 w-44 bg-gray-200 rounded animate-pulse" />
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="card animate-pulse space-y-3">
            <div className="h-4 w-20 bg-gray-200 rounded" />
            <div className="h-3 w-full bg-gray-200 rounded" />
            <div className="h-3 w-3/4 bg-gray-200 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="card text-center py-16 text-gray-500">
          <p>Plan not found.</p>
          <button onClick={() => router.back()} className="btn-secondary mt-4">Go Back</button>
        </div>
      </div>
    );
  }

  const weekMap = groupByWeek(plan.items);
  const weeks = Array.from(weekMap.keys()).sort((a, b) => a - b);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-heading text-2xl font-bold text-charcoal">
            {formatMonth(plan.month)}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-2">
            Lesson Plan
            <span className={`badge ${plan.status === 'submitted' ? 'badge-success' : 'badge-warning'}`}>
              {plan.status}
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => router.back()} className="btn-secondary text-sm">← Back</button>
          <button onClick={() => setShowAddForm((v) => !v)} className="btn-primary text-sm">
            {showAddForm ? 'Cancel' : '+ Add Item'}
          </button>
        </div>
      </div>

      {/* Messages */}
      {successMsg && (
        <div className="card border-green-300 bg-green-50 text-green-800 text-sm">
          ✅ {successMsg}
        </div>
      )}
      {error && (
        <div className="card border-red-300 bg-red-50 text-red-800 text-sm flex items-start justify-between gap-2">
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)} className="flex-shrink-0 text-red-500 hover:text-red-700 font-bold">×</button>
        </div>
      )}

      {/* Add Item Form */}
      {showAddForm && (
        <form onSubmit={handleAddItem} className="card space-y-4 border-saffron-200 bg-saffron-50">
          <h2 className="section-title text-saffron-800">New Plan Item</h2>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">Week *</label>
              <select value={addForm.week} onChange={setField('week')} className="input">
                {[1, 2, 3, 4, 5].map((w) => (
                  <option key={w} value={w}>Week {w}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">Teaching Unit *</label>
              <input
                type="text"
                value={addForm.teachingUnit}
                onChange={setField('teachingUnit')}
                placeholder="e.g. Bhajan — Raghupati Raghav"
                className="input"
                required
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-700">Objectives</label>
            <textarea
              rows={2}
              value={addForm.objectives}
              onChange={setField('objectives')}
              placeholder="Learning objectives for this session..."
              className="input resize-y"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-700">Activities</label>
            <textarea
              rows={2}
              value={addForm.activities}
              onChange={setField('activities')}
              placeholder="Planned activities and exercises..."
              className="input resize-y"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => { setShowAddForm(false); setAddForm(EMPTY_FORM); }}
              className="btn-secondary text-sm"
              disabled={addingItem}
            >
              Cancel
            </button>
            <button type="submit" className="btn-primary text-sm" disabled={addingItem}>
              {addingItem ? 'Adding…' : 'Add Item'}
            </button>
          </div>
        </form>
      )}

      {/* Plan Items by Week */}
      {plan.items.length === 0 ? (
        <div className="card flex flex-col items-center py-12 text-center">
          <span className="text-4xl mb-3">📋</span>
          <p className="text-gray-600 font-medium">No items yet</p>
          <p className="text-gray-400 text-sm mt-1">Add your first plan item using the button above.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {weeks.map((week) => (
            <div key={week} className="card space-y-3">
              <h2 className="section-title text-teal-700">Week {week}</h2>
              <div className="divide-y divide-gray-100">
                {(weekMap.get(week) ?? []).map((item) => (
                  <div key={item.id} className="py-3 first:pt-0 last:pb-0 space-y-1">
                    <p className="text-sm font-semibold text-charcoal">{item.teachingUnit}</p>
                    {item.objectives && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-0.5">Objectives</p>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{item.objectives}</p>
                      </div>
                    )}
                    {item.activities && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-0.5">Activities</p>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{item.activities}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
