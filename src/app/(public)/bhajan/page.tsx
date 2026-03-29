/**
 * Public Bhajan Page — accessible without login.
 * Shows the live/scheduled daily bhajan session.
 */

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface BhajanSession {
  id: string;
  date: string;
  status: 'scheduled' | 'live' | 'ended';
  youtubeLink?: string;
  attendeeCount?: number;
}

function YouTubeEmbed({ link }: { link: string }) {
  // Extract video ID from various YouTube URL formats
  const getVideoId = (url: string) => {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/live\/|youtube\.com\/embed\/)([^&\s?]+)/,
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  };

  const videoId = getVideoId(link);

  if (!videoId) {
    return (
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        className="btn-primary inline-block"
      >
        Open Bhajan Stream ↗
      </a>
    );
  }

  return (
    <div className="aspect-video w-full rounded-lg overflow-hidden shadow-md">
      <iframe
        src={`https://www.youtube.com/embed/${videoId}?autoplay=0&rel=0`}
        title="Daily Bhajan Session"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="w-full h-full"
      />
    </div>
  );
}

function StatusBadge({ status }: { status: BhajanSession['status'] }) {
  if (status === 'live') {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-medium">
        <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
        LIVE NOW
      </span>
    );
  }
  if (status === 'scheduled') {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-saffron-100 text-saffron-700 rounded-full text-sm font-medium">
        <span className="w-2 h-2 bg-saffron-500 rounded-full" />
        Scheduled
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-sm font-medium">
      Session Ended
    </span>
  );
}

export default function BhajanPage() {
  const [session, setSession] = useState<BhajanSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'Asia/Kolkata',
  });

  useEffect(() => {
    fetch('/api/bhajan')
      .then((r) => r.json())
      .then((data) => {
        setSession(data.sessions?.[0] ?? null);
      })
      .catch(() => setError('Could not load bhajan session.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-cream">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-2xl">🎵</span>
            <span className="font-heading font-bold text-saffron-800 text-sm">
              Sangeeta Gurukulam
            </span>
          </Link>
          <Link href="/login" className="btn-secondary text-sm">
            Login
          </Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        {/* Page title */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🙏</div>
          <h1 className="font-heading text-3xl font-bold text-charcoal mb-2">
            Daily Bhajan
          </h1>
          <p className="text-gray-600 text-sm">{today} · 5:30 PM IST</p>
        </div>

        {/* Session card */}
        <div className="card">
          {loading ? (
            <div className="py-12 text-center">
              <div className="text-4xl mb-3 animate-pulse">🎶</div>
              <p className="text-gray-500">Loading session...</p>
            </div>
          ) : error ? (
            <div className="py-8 text-center">
              <p className="text-red-500">{error}</p>
            </div>
          ) : !session ? (
            <div className="py-12 text-center">
              <div className="text-4xl mb-3">🙏</div>
              <h2 className="font-heading text-xl font-semibold text-charcoal mb-2">
                No Session Today
              </h2>
              <p className="text-gray-500 text-sm">
                Today&apos;s bhajan session has not been scheduled yet.
                Please check back at 5:30 PM IST.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Status */}
              <div className="flex items-center justify-between">
                <h2 className="font-heading text-xl font-semibold text-charcoal">
                  Today&apos;s Session
                </h2>
                <StatusBadge status={session.status} />
              </div>

              {/* YouTube embed or placeholder */}
              {session.youtubeLink ? (
                <YouTubeEmbed link={session.youtubeLink} />
              ) : (
                <div className="aspect-video bg-saffron-50 rounded-lg flex flex-col items-center justify-center border-2 border-dashed border-saffron-200">
                  <div className="text-4xl mb-3">🎶</div>
                  <p className="text-saffron-700 font-medium">
                    {session.status === 'scheduled'
                      ? 'Stream link will be added when session starts'
                      : 'No recording available for this session'}
                  </p>
                </div>
              )}

              {/* Attendee count */}
              {session.attendeeCount && (
                <p className="text-sm text-gray-500 text-center">
                  {session.attendeeCount} devotees joined this session
                </p>
              )}
            </div>
          )}
        </div>

        {/* Info section */}
        <div className="mt-6 bg-saffron-50 rounded-lg p-4 text-sm text-saffron-800">
          <p className="font-medium mb-1">About the Daily Bhajan</p>
          <p>
            Sangeeta Gurukulam hosts a daily devotional singing session open to all.
            Students and devotees are welcome to join and participate.
            Sessions are held daily at 5:30 PM IST.
          </p>
        </div>

        {/* CTA for non-students */}
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600 mb-3">
            Want to learn Carnatic music?
          </p>
          <Link href="/register" className="btn-primary">
            Join our Classes
          </Link>
        </div>
      </main>
    </div>
  );
}
