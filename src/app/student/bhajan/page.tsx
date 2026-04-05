/**
 * Student — Join Bhajan Session
 *
 * Shows today's bhajan session status and YouTube link.
 * Saturday sessions are open to all batches (30 min).
 * Daily bhajan at 5:30 PM IST.
 */

'use client';

import { useEffect, useState } from 'react';
import { useAuthContext } from '@/components/layout/AuthProvider';

interface BhajanSession {
  id: string;
  sessionDate: string;
  scheduledTime?: string;
  status: 'scheduled' | 'live' | 'ended';
  youtubeUrl?: string;
  youtubeLink?: string;
  title?: string;
  announcement?: string;
}

const YOUTUBE_CHANNEL = 'http://www.youtube.com/@SangeetaGurukulam';

export default function StudentBhajanPage() {
  const { apiFetch } = useAuthContext();
  const [session, setSession] = useState<BhajanSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/api/bhajan')
      .then((r) => r.json())
      .then((data) => {
        const list = data.sessions ?? (Array.isArray(data) ? data : []);
        setSession(list[0] ?? null);
      })
      .catch(() => setError('Could not load today\'s bhajan session.'))
      .finally(() => setLoading(false));
  }, [apiFetch]);

  const meetLink = session?.youtubeUrl || session?.youtubeLink;
  const isLive = session?.status === 'live';
  const isScheduled = session?.status === 'scheduled';

  return (
    <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-heading text-2xl font-bold text-charcoal">Daily Bhajan</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Live devotional session — every day at 5:30 PM IST · Saturdays open to all batches (30 min)
        </p>
      </div>

      {/* Channel link always visible */}
      <div className="card bg-saffron-50 border-saffron-200 flex items-center gap-4">
        <span className="text-3xl">🎵</span>
        <div className="flex-1">
          <p className="text-sm font-semibold text-saffron-900">Sangeeta Gurukulam YouTube Channel</p>
          <p className="text-xs text-saffron-700 mt-0.5">Watch replays, recordings, and live sessions here.</p>
        </div>
        <a
          href={YOUTUBE_CHANNEL}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary text-xs whitespace-nowrap flex-shrink-0"
        >
          ▶ Open Channel
        </a>
      </div>

      {loading ? (
        <div className="card animate-pulse space-y-3">
          <div className="h-5 w-40 bg-gray-200 rounded" />
          <div className="h-4 w-24 bg-gray-200 rounded" />
          <div className="h-10 w-full bg-gray-200 rounded-lg" />
        </div>
      ) : error ? (
        <div className="card border-red-100 bg-red-50">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      ) : !session ? (
        <div className="card text-center py-10">
          <div className="text-4xl mb-3">🙏</div>
          <p className="text-gray-600 font-medium">No bhajan session scheduled for today</p>
          <p className="text-gray-400 text-sm mt-1 mb-4">
            Check the YouTube channel for replays.
          </p>
          <a
            href={YOUTUBE_CHANNEL}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary inline-block"
          >
            ▶ Visit Channel
          </a>
        </div>
      ) : (
        <div className="card space-y-4">
          {/* Session status */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="font-semibold text-charcoal">
                Today&apos;s Session
                {session.title ? ` — ${session.title}` : ''}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {new Date(session.sessionDate + 'T00:00:00').toLocaleDateString('en-IN', {
                  weekday: 'long', day: 'numeric', month: 'long',
                })} · 5:30 PM IST
              </p>
            </div>
            <span className={`badge ${
              isLive ? 'badge-success' :
              isScheduled ? 'badge-info' : 'badge-neutral'
            }`}>
              {isLive ? '🔴 Live Now' : isScheduled ? '⏰ Upcoming' : 'Ended'}
            </span>
          </div>

          {session.announcement && (
            <p className="text-sm text-saffron-800 bg-saffron-50 rounded-lg px-3 py-2">
              📢 {session.announcement}
            </p>
          )}

          {/* Join button */}
          {meetLink ? (
            <a
              href={meetLink}
              target="_blank"
              rel="noopener noreferrer"
              className={`btn-primary w-full text-center block ${
                session.status === 'ended' ? 'opacity-50 pointer-events-none' : ''
              }`}
            >
              {isLive ? '▶ Join Live Bhajan' :
               isScheduled ? '▶ Open When Live' : '▶ Watch Recording'}
            </a>
          ) : (
            <div className="text-center">
              <p className="text-sm text-gray-500 mb-3">
                {isLive
                  ? 'Live link not yet posted. Check back soon or visit the channel.'
                  : 'Link will be shared when the session goes live.'}
              </p>
              <a
                href={YOUTUBE_CHANNEL}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary inline-block"
              >
                ▶ Open YouTube Channel
              </a>
            </div>
          )}
        </div>
      )}

      {/* Info box */}
      <div className="card bg-gray-50 border-gray-200 text-xs text-gray-600 space-y-1">
        <p>🕐 Sessions run daily at <strong>5:30 PM IST</strong> (17:30 India Standard Time)</p>
        <p>📅 Saturday Bhajan is open to <strong>all batches</strong> (30 minutes)</p>
        <p>🎙️ Sessions are streamed live on the Sangeeta Gurukulam YouTube channel</p>
        <p>📖 Lyrics are shared on the Lyrics page before each session</p>
      </div>
    </div>
  );
}
