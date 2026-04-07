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

  // AI fetch state
  const [fetchingAi, setFetchingAi] = useState(false);
  const [aiRegion, setAiRegion] = useState<'india' | 'international'>('india');
  const [seeding2026, setSeeding2026] = useState(false);

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

  async function reseed2026() {
    if (!confirm('This will DELETE all 2026 events and replace them with curated 2026 festival dates. Continue?')) return;
    setSeeding2026(true);
    setSaveError(null);
    setSaveSuccess(null);
    try {
      const res = await apiFetch('/api/admin/devotional-calendar/seed-2026', { method: 'POST' });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setSaveError(json.error ?? 'Failed to reseed 2026.');
        return;
      }
      setSaveSuccess(`Reseeded 2026: cleared ${json.cleared} old events, created ${json.created} correct 2026 events.`);
      load();
    } catch {
      setSaveError('Network error during reseed.');
    } finally {
      setSeeding2026(false);
    }
  }

  async function fetchFromDrikPanchang() {
    setFetchingAi(true);
    setSaveError(null);
    setSaveSuccess(null);

    const month = monthKey(new Date(viewYear, viewMonth, 1));
    try {
      const res = await apiFetch('/api/admin/devotional-calendar/fetch-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, region: aiRegion }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setSaveError(json.error ?? 'Failed to fetch events from AI.');
        return;
      }
      setSaveSuccess(
        `Fetched ${json.created} new event${json.created !== 1 ? 's' : ''} from Drik Panchang` +
        (json.skipped > 0 ? ` (${json.skipped} duplicates skipped)` : '') +
        '.'
      );
      load();
    } catch {
      setSaveError('Network error fetching from Drik Panchang.');
    } finally {
      setFetchingAi(false);
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

      {/* Reseed 2026 — one-click fix for correct Hindu festival dates */}
      <div className="card border-green-200 bg-green-50">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-sm font-semibold text-green-900">Reseed All 2026 Festivals</p>
            <p className="text-xs text-green-700 mt-0.5">
              Clears any wrong dates and populates all correct 2026 Hindu festival dates (curated from Drik Panchang).
            </p>
          </div>
          <button
            onClick={reseed2026}
            disabled={seeding2026}
            className="btn bg-green-600 text-white hover:bg-green-700 focus:ring-green-500 text-xs flex-shrink-0"
          >
            {seeding2026 ? 'Reseeding…' : '✦ Reseed 2026'}
          </button>
        </div>
      </div>

      {/* AI Fetch from Drik Panchang */}
      <div className="card border-purple-200 bg-purple-50">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-sm font-semibold text-purple-900">Auto-populate from Drik Panchang</p>
            <p className="text-xs text-purple-700 mt-0.5">
              Uses AI to fetch festivals, ekadashis, vrats, and pujas for the selected month and region.
            </p>
            <p className="text-[10px] text-purple-500 mt-1">
              Source: <a href="https://www.drikpanchang.com" target="_blank" rel="noopener noreferrer" className="underline">drikpanchang.com</a>
            </p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <select
              className="input w-auto text-xs py-1.5"
              value={aiRegion}
              onChange={(e) => setAiRegion(e.target.value as 'india' | 'international')}
            >
              <option value="india">India</option>
              <option value="international">International</option>
            </select>
            <button
              onClick={fetchFromDrikPanchang}
              disabled={fetchingAi}
              className="btn bg-purple-600 text-white hover:bg-purple-700 focus:ring-purple-500 text-xs"
            >
              {fetchingAi ? 'Fetching…' : 'Fetch Events'}
            </button>
          </div>
        </div>
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
          <>
            <div className="card p-0 overflow-hidden divide-y divide-gray-100">
              {events.map((ev) => (
                <div key={ev.id} className="px-5 py-4 flex items-start gap-4">
                  <div className="text-2xl flex-shrink-0">🪔</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-charcoal">
                        {ev.title}
                      </p>
                      <span className={`badge ${eventTypeBadge(ev.eventType)}`}>
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
            <p className="text-[10px] text-gray-400 mt-2 text-center">
              Event information referenced from{' '}
              <a href="https://www.drikpanchang.com" target="_blank" rel="noopener noreferrer" className="underline hover:no-underline">
                Drik Panchang
              </a>
              . Dates may vary by region.
            </p>
          </>
        )}
      </section>
    </div>
  );
}
