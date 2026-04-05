/**
 * Teacher Availability — /teacher/availability
 *
 * Monthly calendar where teacher clicks dates to mark as unavailable.
 * Unavailable dates are highlighted. Click again to remove.
 */

'use client';

import { useEffect, useState } from 'react';
import { useAuthContext } from '@/components/layout/AuthProvider';

interface AvailabilityBlock {
  id: string;
  startDate: string;
  endDate: string;
  reason: string;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const REASONS = ['Travel', 'Festival / Holiday', 'Illness', 'Personal', 'Other'];

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function AvailabilityPage() {
  const { apiFetch, user } = useAuthContext();
  const [blocks, setBlocks] = useState<AvailabilityBlock[]>([]);
  const [loading, setLoading] = useState(true);

  // Calendar state
  const today = new Date();
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());

  // Selected date for adding reason
  const [pendingDate, setPendingDate] = useState<string | null>(null);
  const [pendingReason, setPendingReason] = useState('Personal');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;
    apiFetch('/api/teacher/availability')
      .then((r) => r.json())
      .then((data) => setBlocks(Array.isArray(data) ? data : data.blocks ?? []))
      .catch(() => setBlocks([]))
      .finally(() => setLoading(false));
  }, [apiFetch, user]);

  // Build set of all blocked dates
  const blockedMap = new Map<string, string>(); // date -> blockId
  for (const block of blocks) {
    const start = new Date(block.startDate + 'T00:00:00');
    const end = new Date(block.endDate + 'T00:00:00');
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      blockedMap.set(toDateStr(new Date(d)), block.id);
    }
  }

  function prevMonth() {
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11); }
    else setCalMonth(m => m - 1);
  }
  function nextMonth() {
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0); }
    else setCalMonth(m => m + 1);
  }

  function buildCalendarDays() {
    const firstDay = new Date(calYear, calMonth, 1).getDay(); // 0=Sun
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const days: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let d = 1; d <= daysInMonth; d++) days.push(d);
    return days;
  }

  async function handleDateClick(dateStr: string) {
    const existingBlockId = blockedMap.get(dateStr);
    if (existingBlockId) {
      // Remove the block
      setSaving(true);
      try {
        const r = await apiFetch(`/api/teacher/availability?id=${encodeURIComponent(existingBlockId)}`, { method: 'DELETE' });
        if (r.ok) {
          setBlocks(b => b.filter(block => block.id !== existingBlockId));
        } else {
          setError('Failed to remove date.');
        }
      } catch {
        setError('Something went wrong.');
      } finally {
        setSaving(false);
      }
    } else {
      // Show reason selector for this date
      setPendingDate(dateStr);
      setPendingReason('Personal');
    }
  }

  async function confirmAddDate() {
    if (!pendingDate) return;
    setSaving(true);
    setError('');
    try {
      const r = await apiFetch('/api/teacher/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate: pendingDate, endDate: pendingDate, reason: pendingReason }),
      });
      if (r.ok) {
        const data = await r.json();
        setBlocks(b => [...b, { id: data.id, startDate: pendingDate, endDate: pendingDate, reason: pendingReason }]);
        setPendingDate(null);
      } else {
        setError('Failed to mark date.');
      }
    } catch {
      setError('Something went wrong.');
    } finally {
      setSaving(false);
    }
  }

  const calDays = buildCalendarDays();
  const monthLabel = new Date(calYear, calMonth, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-charcoal">My Availability</h1>
        <p className="text-sm text-gray-500 mt-1">
          Click any date to mark it as unavailable. Classes on blocked dates will be auto-cancelled and won&#39;t count as student violations.
        </p>
      </div>

      {error && (
        <div className="card border-red-300 bg-red-50 text-red-800 text-sm flex items-center justify-between gap-2">
          <span>&#9888;&#65039; {error}</span>
          <button onClick={() => setError('')} className="text-red-500 font-bold">&#xd7;</button>
        </div>
      )}

      {/* Calendar */}
      <div className="card space-y-4">
        {/* Month navigation */}
        <div className="flex items-center justify-between">
          <button onClick={prevMonth} className="btn-secondary px-3 py-1.5 text-sm">&#x2190;</button>
          <h2 className="font-semibold text-charcoal">{monthLabel}</h2>
          <button onClick={nextMonth} className="btn-secondary px-3 py-1.5 text-sm">&#x2192;</button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 gap-1">
          {DAYS.map((d) => (
            <div key={d} className="text-center text-xs font-semibold text-gray-500 py-1">{d}</div>
          ))}
        </div>

        {/* Calendar cells */}
        {loading ? (
          <div className="h-40 animate-pulse bg-gray-100 rounded-lg" />
        ) : (
          <div className="grid grid-cols-7 gap-1">
            {calDays.map((day, i) => {
              if (!day) return <div key={`empty-${i}`} />;
              const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const isBlocked = blockedMap.has(dateStr);
              const isToday = dateStr === toDateStr(today);
              const isPast = dateStr < toDateStr(today);
              return (
                <button
                  key={dateStr}
                  disabled={saving}
                  onClick={() => !isPast && handleDateClick(dateStr)}
                  className={`
                    rounded-lg py-2 text-sm font-medium transition-colors
                    ${isBlocked
                      ? 'bg-red-500 text-white hover:bg-red-600'
                      : isPast
                      ? 'text-gray-300 cursor-default'
                      : isToday
                      ? 'bg-saffron-100 text-saffron-800 border border-saffron-400 hover:bg-saffron-200'
                      : 'hover:bg-gray-100 text-charcoal'
                    }
                  `}
                >
                  {day}
                </button>
              );
            })}
          </div>
        )}

        <div className="flex items-center gap-4 text-xs text-gray-500 pt-1 border-t border-gray-100">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-500 inline-block" /> Unavailable</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-saffron-200 border border-saffron-400 inline-block" /> Today</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-gray-100 inline-block" /> Available</span>
        </div>
      </div>

      {/* Reason picker popup */}
      {pendingDate && (
        <div className="card border-saffron-300 bg-saffron-50 space-y-3">
          <p className="font-medium text-charcoal text-sm">
            Mark <span className="text-saffron-700">{new Date(pendingDate + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</span> as unavailable
          </p>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-700">Reason</label>
            <select
              value={pendingReason}
              onChange={(e) => setPendingReason(e.target.value)}
              className="input w-full"
            >
              {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setPendingDate(null)} className="btn-secondary text-sm flex-1">Cancel</button>
            <button onClick={confirmAddDate} disabled={saving} className="btn-primary text-sm flex-1">
              {saving ? 'Saving…' : 'Confirm'}
            </button>
          </div>
        </div>
      )}

      {/* Upcoming blocked dates list */}
      {blocks.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-charcoal">Upcoming Unavailable Dates</h2>
          {blocks
            .filter(b => b.endDate >= toDateStr(today))
            .sort((a, b) => a.startDate.localeCompare(b.startDate))
            .map(block => (
              <div key={block.id} className="card flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-medium text-charcoal">
                    {block.startDate === block.endDate
                      ? new Date(block.startDate + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
                      : `${block.startDate} &#x2192; ${block.endDate}`}
                  </p>
                  <p className="text-xs text-gray-500">{block.reason}</p>
                </div>
              </div>
            ))
          }
        </div>
      )}
    </div>
  );
}
