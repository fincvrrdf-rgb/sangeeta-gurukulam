/**
 * Admin Devotional Calendar — /admin/devotional-calendar
 *
 * Month grid view + list view of devotional events.
 * Supports adding new events via POST /api/admin/devotional-calendar.
 * GET /api/admin/devotional-calendar
 */

'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuthContext } from '@/components/layout/AuthProvider';
import type { DevotionalCalendarEvent } from '@/domain/types';

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function firstDayOfWeek(year: number, month: number): number {
  return new Date(year, month, 1).getDay(); // 0=Sun
}

const EVENT_TYPE_COLOURS: Record<string, string> = {
  festival: 'bg-saffron-100 text-saffron-800',
  vrat: 'bg-purple-100 text-purple-800',
  ekadashi: 'bg-teal-100 text-teal-800',
  puja: 'bg-pink-100 text-pink-800',
  other: 'bg-gray-100 text-gray-700',
};

function eventTypeBadge(type: string) {
  return EVENT_TYPE_COLOURS[type] ?? EVENT_TYPE_COLOURS.other;
}

// ── Add Event Form ─────────────────────────────────────────────────────────

interface EventFormState {
  name: string;
  date: string;
  eventType: string;
  description: string;
}

const EMPTY_EVENT_FORM: EventFormState = {
  name: '',
  date: '',
  eventType: 'festival',
  description: '',
};

const EVENT_TYPES = [
  { value: 'festival', label: 'Festival' },
  { value: 'vrat', label: 'Vrat' },
  { value: 'ekadashi', label: 'Ekadashi' },
  { value: 'puja', label: 'Puja' },
  { value: 'other', label: 'Other' },
];

// ── Calendar Grid ──────────────────────────────────────────────────────────

function CalendarGrid({
  year,
  month,
  events,
}: {
  year: number;
  month: number;
  events: DevotionalCalendarEvent[];
}) {
  const days = daysInMonth(year, month);
  const offset = firstDayOfWeek(year, month);
  const cells: (number | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ];
  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;

  return (
    <div className="card p-0 overflow-hidden">
      {/* Day-of-week header */}
      <div className="grid grid-cols-7 border-b border-gray-100">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div
            key={d}
            className="py-2 text-center text-xs font-medium text-gray-500"
          >
            {d}
          </div>
        ))}
      </div>
      {/* Cells */}
      <div className="grid grid-cols-7">
        {cells.map((day, idx) => {
          const dateStr = day
            ? `${monthPrefix}-${String(day).padStart(2, '0')}`
            : null;
          const dayEvents = dateStr
            ? events.filter(
                (e) =>
                  e.eventDate === dateStr ||
                  (e.eventDate ?? '').startsWith(dateStr)
              )
            : [];
          const isToday =
            dateStr === new Date().toISOString().slice(0, 10);
          return (
            <div
              key={idx}
              className={`min-h-[52px] p-1 border-b border-r border-gray-100 ${
                !day ? 'bg-gray-50' : ''
              } ${isToday ? 'bg-saffron-50' : ''}`}
            >
              {day && (
                <>
                  <p
                    className={`text-xs font-medium mb-0.5 ${
                      isToday
                        ? 'text-saffron-700 font-bold'
                        : 'text-gray-600'
                    }`}
                  >
                    {day}
                  </p>
                  {dayEvents.slice(0, 2).map((ev) => (
                    <div
                      key={ev.id}
                      title={ev.title}
                      className="text-[9px] leading-tight px-1 py-0.5 rounded bg-saffron-200 text-saffron-900 truncate mb-0.5"
                    >
                      {ev.title}
                    </div>
                  ))}
                  {dayEvents.length > 2 && (
                    <div className="text-[9px] text-gray-400">
                      +{dayEvents.length - 2} more
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function DevotionalCalendarPage() {
  const { user, apiFetch } = useAuthContext();

  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [events, setEvents] = useState<DevotionalCalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<EventFormState>(EMPTY_EVENT_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!user) return;
    setLoading(true);
    setError(null);

    const month = monthKey(new Date(viewYear, viewMonth, 1));
    apiFetch(`/api/admin/devotional-calendar?month=${month}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          const sorted = [...(d.events ?? [])].sort(
            (a: DevotionalCalendarEvent, b: DevotionalCalendarEvent) =>
              (a.eventDate ?? '').localeCompare(b.eventDate ?? '')
          );
          setEvents(sorted);
        } else {
          setError('Failed to load calendar events.');
        }
      })
      .catch(() => setError('Network error loading calendar.'))
      .finally(() => setLoading(false));
  }, [user, apiFetch, viewYear, viewMonth]);

  useEffect(() => {
    load();
  }, [load]);

  function prevMonth() {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  }

  function nextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  }

  async function handleAddEvent(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(null);

    try {
      const res = await apiFetch('/api/admin/devotional-calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          date: form.date,
          eventType: form.eventType,
          description: form.description,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setSaveError(json.error ?? 'Failed to create event.');
        return;
      }
      setSaveSuccess(`Event "${form.name}" created.`);
      setShowForm(false);
      setForm(EMPTY_EVENT_FORM);
      load();
    } catch {
      setSaveError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-heading text-2xl font-bold text-charcoal">
            Devotional Calendar
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Festivals, vrats, ekadashis, and observances
          </p>
        </div>
        <button
          onClick={() => {
            setShowForm((v) => !v);
            setSaveError(null);
          }}
          className="btn-primary flex-shrink-0"
        >
          {showForm ? 'Cancel' : '+ Add Event'}
        </button>
      </div>

      {/* Success */}
      {saveSuccess && (
        <div className="rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800">
          {saveSuccess}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 flex items-center justify-between gap-3">
          <span>{error}</span>
          <button onClick={load} className="underline text-red-700 hover:no-underline flex-shrink-0">
            Retry
          </button>
        </div>
      )}

      {/* Add Event Form */}
      {showForm && (
        <div className="card border-saffron-300 bg-saffron-50">
          <h3 className="section-title mb-4">New Devotional Event</h3>
          <form onSubmit={handleAddEvent} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Event Name <span className="text-red-500">*</span>
              </label>
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Krishnashtami"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  className="input"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Event Type
                </label>
                <select
                  className="input"
                  value={form.eventType}
                  onChange={(e) => setForm({ ...form, eventType: e.target.value })}
                >
                  {EVENT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                className="input"
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Brief description or significance…"
              />
            </div>
            {saveError && (
              <p className="text-sm text-red-600">{saveError}</p>
            )}
            <div className="flex gap-3">
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? 'Saving…' : 'Add Event'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setForm(EMPTY_EVENT_FORM);
                  setSaveError(null);
                }}
                disabled={saving}
                className="btn-secondary"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <button onClick={prevMonth} className="btn-secondary px-3 py-1.5 text-xs">
          ← Prev
        </button>
        <h2 className="font-heading font-semibold text-charcoal">
          {MONTHS[viewMonth]} {viewYear}
        </h2>
        <button onClick={nextMonth} className="btn-secondary px-3 py-1.5 text-xs">
          Next →
        </button>
      </div>

      {/* Calendar Grid */}
      {loading ? (
        <div className="card animate-pulse h-48 flex items-center justify-center text-gray-300 text-sm">
          Loading calendar…
        </div>
      ) : (
        <CalendarGrid year={viewYear} month={viewMonth} events={events} />
      )}

      {/* Event List */}
      <section>
        <h2 className="section-title mb-3">
          Events — {MONTHS[viewMonth]} {viewYear}
        </h2>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="card animate-pulse h-16" />
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="card text-center py-10 text-gray-400 text-sm">
            No events this month.{' '}
            <button
              onClick={() => setShowForm(true)}
              className="text-saffron-600 underline hover:no-underline"
            >
              Add one
            </button>
          </div>
        ) : (
          <div className="card p-0 overflow-hidden divide-y divide-gray-100">
            {events.map((ev) => (
              <div key={ev.id} className="px-5 py-4 flex items-start gap-4">
                <div className="text-2xl flex-shrink-0">🪔</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-charcoal">
                      {ev.title}
                    </p>
                    <span
                      className={`badge ${eventTypeBadge(ev.eventType)}`}
                    >
                      {ev.eventType}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {formatDate(ev.eventDate)}
                  </p>
                  {ev.description && (
                    <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                      {ev.description}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
