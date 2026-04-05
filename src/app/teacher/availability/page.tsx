/**
 * Teacher — Availability blocks management.
 * Teachers can mark periods when they are unavailable for classes.
 */

'use client';

import { useEffect, useState } from 'react';
import { useAuthContext } from '@/components/layout/AuthProvider';

interface AvailabilityBlock {
  id: string;
  startDate: string;
  endDate: string;
  reason: string;
  createdAt: string;
}

export default function AvailabilityPage() {
  const { apiFetch, user } = useAuthContext();
  const [blocks, setBlocks] = useState<AvailabilityBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ startDate: '', endDate: '', reason: '' });
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;
    apiFetch('/api/teacher/availability')
      .then((r) => r.json())
      .then((data) => setBlocks(Array.isArray(data) ? data : data.blocks ?? []))
      .catch(() => setBlocks([]))
      .finally(() => setLoading(false));
  }, [apiFetch, user]);

  async function submit() {
    if (!form.startDate || !form.endDate || !form.reason.trim()) {
      setError('All fields are required.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      // POST to a teacher availability endpoint (to be built or use direct Firestore)
      const r = await apiFetch('/api/teacher/availability', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      if (r.ok) {
        const data = await r.json();
        setBlocks(b => [{ id: data.id, ...form, createdAt: new Date().toISOString() }, ...b]);
        setShowForm(false);
        setForm({ startDate: '', endDate: '', reason: '' });
      } else {
        setError('Failed to save availability block.');
      }
    } catch {
      setError('Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteBlock(id: string) {
    setDeleting(id);
    try {
      const r = await apiFetch(`/api/teacher/availability?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (r.ok) {
        setBlocks((b) => b.filter((block) => block.id !== id));
      } else {
        setError('Failed to delete block.');
      }
    } catch {
      setError('Something went wrong.');
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="section-title mb-0">My Availability</h1>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary text-sm">
          {showForm ? 'Cancel' : '+ Mark Unavailable'}
        </button>
      </div>

      <p className="text-sm text-gray-500 mb-6">
        Mark dates when you are unavailable. Classes on these dates will be automatically marked as teacher-cancelled
        and will NOT count as student violations.
      </p>

      {showForm && (
        <div className="card mb-6 border-saffron-200">
          <h2 className="font-heading font-semibold text-charcoal mb-4">Add Unavailability Block</h2>
          {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                <input type="date" value={form.startDate}
                  onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                  className="input w-full" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                <input type="date" value={form.endDate}
                  onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                  className="input w-full" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
              <input type="text" value={form.reason}
                onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                className="input w-full" placeholder="e.g. Personal travel, Festival, Illness" />
            </div>
            <button onClick={submit} disabled={submitting} className="btn-primary w-full">
              {submitting ? 'Saving...' : 'Save Availability Block'}
            </button>
          </div>
        </div>
      )}

      {loading && <div className="card animate-pulse h-20" />}

      {!loading && blocks.length === 0 && (
        <div className="card text-center py-10">
          <div className="text-4xl mb-3">📅</div>
          <p className="text-gray-600 font-medium">No unavailability blocks</p>
          <p className="text-gray-400 text-sm mt-1">
            You&apos;re available for all scheduled classes.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {blocks.map(block => (
          <div key={block.id} className="card flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-charcoal">
                {block.startDate}{block.endDate !== block.startDate ? ` → ${block.endDate}` : ''}
              </p>
              <p className="text-sm text-gray-500 mt-0.5">{block.reason}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="badge-warning text-xs">Unavailable</span>
              <button
                onClick={() => deleteBlock(block.id)}
                disabled={deleting === block.id}
                className="text-xs text-red-500 hover:text-red-700 transition-colors disabled:opacity-50"
              >
                {deleting === block.id ? '…' : '✕ Remove'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
