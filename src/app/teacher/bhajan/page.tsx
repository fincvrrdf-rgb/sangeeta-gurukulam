/**
 * Bhajan Session Manager — /teacher/bhajan
 *
 * View today's bhajan session, update the YouTube link, toggle status,
 * and record attendee count.
 */

'use client';

import { useEffect, useState } from 'react';
import { useAuthContext } from '@/components/layout/AuthProvider';

type BhajanStatus = 'scheduled' | 'live' | 'ended';

interface BhajanSession {
  id: string;
  sessionDate: string;   // Firestore field
  scheduledTime?: string;
  status: BhajanStatus;
  youtubeUrl?: string;   // Firestore field
  attendeeCount?: number;
  timezone?: string;
}

const STATUS_FLOW: BhajanStatus[] = ['scheduled', 'live', 'ended'];

const STATUS_META: Record<BhajanStatus, { label: string; badge: string; next: string | null }> = {
  scheduled: { label: 'Scheduled',  badge: 'badge badge-info',    next: 'Go Live' },
  live:      { label: 'Live Now',   badge: 'badge badge-success', next: 'End Session' },
  ended:     { label: 'Ended',      badge: 'badge badge-neutral', next: null },
};

function nextStatus(current: BhajanStatus): BhajanStatus | null {
  const idx = STATUS_FLOW.indexOf(current);
  return idx < STATUS_FLOW.length - 1 ? STATUS_FLOW[idx + 1] : null;
}

function formatDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function BhajanSkeleton() {
  return (
    <div className="card animate-pulse space-y-4">
      <div className="h-4 w-48 bg-gray-200 rounded" />
      <div className="h-6 w-24 bg-gray-200 rounded-full" />
      <div className="h-10 w-full bg-gray-200 rounded-lg" />
      <div className="h-10 w-full bg-gray-200 rounded-lg" />
    </div>
  );
}

export default function BhajanSessionPage() {
  const { user, apiFetch } = useAuthContext();

  const [session, setSession] = useState<BhajanSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [youtubeInput, setYoutubeInput] = useState('');
  const [attendeeInput, setAttendeeInput] = useState('');
  const [savingLink, setSavingLink] = useState(false);
  const [savingAttendees, setSavingAttendees] = useState(false);
  const [advancingStatus, setAdvancingStatus] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    apiFetch('/api/bhajan')
      .then((r) => r.json())
      .then((data) => {
        const list = data.sessions ?? (Array.isArray(data) ? data : []);
        const s: BhajanSession | null = list[0] ?? null;
        setSession(s);
        if (s) {
          setYoutubeInput(s.youtubeUrl ?? '');
          setAttendeeInput(s.attendeeCount != null ? String(s.attendeeCount) : '');
        }
      })
      .catch((err) => setError(err.message ?? 'Failed to load bhajan session.'))
      .finally(() => setLoading(false));
  }, [user, apiFetch]);

  function flash(msg: string) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3000);
  }

  async function handleSaveLink() {
    if (!session) return;
    setSavingLink(true);
    try {
      const res = await apiFetch(`/api/bhajan/${session.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ youtubeLink: youtubeInput.trim() }),
      });
      if (!res.ok) throw new Error('Save failed');
      setSession((prev) => prev ? { ...prev, youtubeUrl: youtubeInput.trim() } : prev);
      flash('YouTube link saved.');
    } catch {
      setError('Could not save YouTube link. Please try again.');
    } finally {
      setSavingLink(false);
    }
  }

  async function handleSaveAttendees() {
    if (!session) return;
    const count = parseInt(attendeeInput, 10);
    if (isNaN(count) || count < 0) {
      setError('Please enter a valid attendee count.');
      return;
    }
    setSavingAttendees(true);
    try {
      const res = await apiFetch(`/api/bhajan/${session.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendeeCount: count }),
      });
      if (!res.ok) throw new Error('Save failed');
      setSession((prev) => prev ? { ...prev, attendeeCount: count } : prev);
      flash('Attendee count saved.');
    } catch {
      setError('Could not save attendee count. Please try again.');
    } finally {
      setSavingAttendees(false);
    }
  }

  async function handleAdvanceStatus() {
    if (!session) return;
    const next = nextStatus(session.status);
    if (!next) return;
    if (!confirm(`Change status to "${STATUS_META[next].label}"?`)) return;
    setAdvancingStatus(true);
    try {
      const res = await apiFetch(`/api/bhajan/${session.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) throw new Error('Update failed');
      setSession((prev) => prev ? { ...prev, status: next } : prev);
      flash(`Status updated to ${STATUS_META[next].label}.`);
    } catch {
      setError('Could not update status. Please try again.');
    } finally {
      setAdvancingStatus(false);
    }
  }

  const meta = session ? STATUS_META[session.status] : null;
  const canAdvance = session ? !!nextStatus(session.status) : false;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-heading text-2xl font-bold text-charcoal">Bhajan Session</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage today's live bhajan session</p>
      </div>

      {/* Success message */}
      {successMsg && (
        <div className="card border-green-300 bg-green-50 text-green-800 text-sm">
          ✅ {successMsg}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="card border-red-300 bg-red-50 text-red-800 text-sm flex items-start justify-between gap-2">
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)} className="flex-shrink-0 text-red-500 hover:text-red-700 font-bold">×</button>
        </div>
      )}

      {loading ? (
        <BhajanSkeleton />
      ) : !session ? (
        <div className="card flex flex-col items-center py-16 text-center">
          <span className="text-4xl mb-3">🙏</span>
          <p className="text-gray-500 text-sm">No bhajan session for today.</p>
          <p className="text-xs text-gray-400 mt-1 mb-4">You can create one manually to go live.</p>
          <button
            className="btn-primary"
            onClick={async () => {
              setLoading(true);
              try {
                const today = new Date().toISOString().slice(0, 10);
                const res = await apiFetch('/api/bhajan', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ date: today, status: 'scheduled' }),
                });
                const json = await res.json();
                if (!res.ok) throw new Error(json.error ?? 'Failed');
                // Reload
                const r2 = await apiFetch('/api/bhajan');
                const data2 = await r2.json();
                const list2 = data2.sessions ?? [];
                const s2 = list2[0] ?? null;
                setSession(s2);
                if (s2) {
                  setYoutubeInput(s2.youtubeUrl ?? '');
                }
                // Open YouTube Studio so teacher can go live
                window.open('https://studio.youtube.com', '_blank', 'noopener');
              } catch (e: unknown) {
                setError(e instanceof Error ? e.message : 'Could not create session.');
              } finally {
                setLoading(false);
              }
            }}
          >
            🎵 Create Today's Session
          </button>
        </div>
      ) : (
        <div className="space-y-4">

          {/* Session Info Card */}
          <div className="card space-y-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">Today's Session</p>
                <p className="text-base font-semibold text-charcoal mt-0.5">
                  {formatDate(session.sessionDate)} at {session.scheduledTime}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">{session.timezone}</p>
              </div>
              <span className={meta!.badge}>{meta!.label}</span>
            </div>

            {/* Status Pipeline */}
            <div className="flex items-center gap-2 mt-2">
              {STATUS_FLOW.map((s, i) => {
                const isActive = session.status === s;
                const isPast = STATUS_FLOW.indexOf(session.status) > i;
                return (
                  <div key={s} className="flex items-center gap-2">
                    <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                      isActive
                        ? 'bg-saffron-100 text-saffron-800 border border-saffron-300'
                        : isPast
                        ? 'bg-gray-100 text-gray-500'
                        : 'bg-white border border-gray-200 text-gray-400'
                    }`}>
                      {isPast && <span>✓</span>}
                      {STATUS_META[s].label}
                    </div>
                    {i < STATUS_FLOW.length - 1 && (
                      <span className="text-gray-300 text-xs">→</span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Go Live button */}
            <a
              href="https://studio.youtube.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold py-2.5 transition-colors mt-2"
            >
              <span className="text-base">&#x1F534;</span> Go Live on YouTube Studio
            </a>

            {/* Advance Status Button */}
            {canAdvance && (
              <button
                onClick={handleAdvanceStatus}
                disabled={advancingStatus}
                className={`btn-primary w-full mt-2 ${session.status === 'live' ? '!bg-red-600 hover:!bg-red-700 focus:!ring-red-500' : ''}`}
              >
                {advancingStatus
                  ? 'Updating…'
                  : meta!.next}
              </button>
            )}
          </div>

          {/* YouTube Link Card */}
          <div className="card space-y-3">
            <h2 className="section-title">YouTube Link</h2>
            <p className="text-xs text-gray-500">
              Paste the YouTube live stream or recording link for students to watch.
            </p>
            <div className="flex gap-2">
              <input
                type="url"
                placeholder="https://youtube.com/live/..."
                value={youtubeInput}
                onChange={(e) => setYoutubeInput(e.target.value)}
                className="input"
              />
              <button
                onClick={handleSaveLink}
                disabled={savingLink}
                className="btn-primary whitespace-nowrap"
              >
                {savingLink ? 'Saving…' : 'Save'}
              </button>
            </div>
            {session.youtubeUrl && (
              <a
                href={session.youtubeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-teal-600 hover:text-teal-700 hover:underline"
              >
                <span>▶</span>
                Open current link
              </a>
            )}
          </div>

          {/* Attendee Count Card */}
          <div className="card space-y-3">
            <h2 className="section-title">Attendee Count</h2>
            <p className="text-xs text-gray-500">
              Record the number of live attendees for this session.
            </p>
            <div className="flex gap-2 items-center">
              <input
                type="number"
                min="0"
                placeholder="0"
                value={attendeeInput}
                onChange={(e) => setAttendeeInput(e.target.value)}
                className="input max-w-[140px]"
              />
              <span className="text-sm text-gray-500">attendees</span>
              <button
                onClick={handleSaveAttendees}
                disabled={savingAttendees}
                className="btn-primary ml-auto"
              >
                {savingAttendees ? 'Saving…' : 'Save Count'}
              </button>
            </div>
            {session.attendeeCount != null && (
              <p className="text-xs text-gray-500">
                Last recorded: <span className="font-medium text-charcoal">{session.attendeeCount}</span> attendees
              </p>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
