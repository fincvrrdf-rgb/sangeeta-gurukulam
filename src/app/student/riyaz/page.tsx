/**
 * Riyaz Check-in — /student/riyaz
 *
 * Lets students log a personal practice (riyaz) session with a duration.
 * Shows a streak counter and recent check-in history.
 *
 * TODO: Requires /api/riyaz route (GET + POST) backed by a
 *       `riyaz_checkins` Firestore collection (fields: uid, duration, notes, createdAt).
 */

'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useAuthContext } from '@/components/layout/AuthProvider';

interface RiyazCheckin {
  id: string;
  duration?: number;        // legacy
  durationMinutes?: number; // current field name
  notes?: string;
  createdAt: string;
}

interface RiyazStats {
  currentStreak: number;
  longestStreak: number;
  totalSessions: number;
  totalMinutes: number;
}

type SubmitState = 'idle' | 'loading' | 'success' | 'error';

const DURATION_PRESETS = [15, 30, 45, 60, 90];

const MOTIVATIONAL_MESSAGES = [
  'Nityabhyasam brings mastery! 🎵',
  'Every riyaz takes you closer to perfection.',
  'Sadhana is the path. Keep going!',
  'The ragas remember your dedication.',
  'Consistency builds a singer. Well done!',
];

function randomMotivation(): string {
  return MOTIVATIONAL_MESSAGES[Math.floor(Math.random() * MOTIVATIONAL_MESSAGES.length)];
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'Yesterday';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function StreakFlame({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: Math.min(count, 7) }).map((_, i) => (
        <span key={i} className="text-lg" title={`Day ${i + 1}`}>
          &#x1F525;
        </span>
      ))}
      {count > 7 && (
        <span className="text-sm font-bold text-saffron-700 ml-1">+{count - 7}</span>
      )}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="card animate-pulse space-y-2">
      <div className="h-4 w-24 bg-gray-200 rounded" />
      <div className="h-8 w-16 bg-gray-200 rounded" />
    </div>
  );
}

const SA_PITCHES = ['C', 'C#/Db', 'D', 'D#/Eb', 'E', 'F', 'F#/Gb', 'G', 'G#/Ab', 'A', 'A#/Bb', 'B'];

export default function RiyazPage() {
  const { user, apiFetch } = useAuthContext();

  const [checkins, setCheckins] = useState<RiyazCheckin[]>([]);
  const [stats, setStats] = useState<RiyazStats | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Pitch check state
  const [showPitchCheck, setShowPitchCheck] = useState(false);
  const [selectedPitch, setSelectedPitch] = useState('C');
  const [pitchObservations, setPitchObservations] = useState('');
  const [pitchLoading, setPitchLoading] = useState(false);
  const [pitchFeedback, setPitchFeedback] = useState<string | null>(null);
  const [pitchError, setPitchError] = useState<string | null>(null);

  const [duration, setDuration] = useState<number>(30);
  const [customDuration, setCustomDuration] = useState('');
  const [useCustom, setUseCustom] = useState(false);
  const [notes, setNotes] = useState('');
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [motivation, setMotivation] = useState('');

  function loadHistory() {
    if (!user) return;
    apiFetch('/api/riyaz')
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load history (${r.status})`);
        return r.json();
      })
      .then((data) => {
        setCheckins(Array.isArray(data) ? data : data.checkins ?? []);
        if (data.stats) setStats(data.stats);
      })
      .catch((err) => setFetchError(err.message ?? 'Could not load riyaz history.'))
      .finally(() => setLoadingHistory(false));
  }

  useEffect(() => { loadHistory(); }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handlePitchCheck() {
    setPitchLoading(true);
    setPitchFeedback(null);
    setPitchError(null);
    try {
      const res = await apiFetch('/api/riyaz/pitch-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pitch: selectedPitch,
          swarasAttempted: 'S R G M P D N S',
          observations: pitchObservations.trim() || undefined,
          ragam: 'Maya Malava Gowla',
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'AI feedback failed');
      setPitchFeedback(json.feedback);
    } catch (e: unknown) {
      setPitchError(e instanceof Error ? e.message : 'Could not get feedback. Try again.');
    } finally {
      setPitchLoading(false);
    }
  }

  const effectiveDuration = useCustom
    ? parseInt(customDuration, 10) || 0
    : duration;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (effectiveDuration < 1) return;

    setSubmitState('loading');
    setSubmitError(null);

    try {
      const res = await apiFetch('/api/riyaz', {
        method: 'POST',
        body: JSON.stringify({
          durationMinutes: effectiveDuration,
          notes: notes.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Server error (${res.status})`);
      }

      setMotivation(randomMotivation());
      setSubmitState('success');
      setNotes('');
      if (useCustom) setCustomDuration('');

      // Reload history to show new entry
      setLoadingHistory(true);
      loadHistory();
    } catch (err: unknown) {
      setSubmitState('error');
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="font-heading text-2xl font-bold text-charcoal">
          Riyaz Check-in
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Log your personal practice session and build a daily streak.
        </p>
      </div>

      {/* Success message */}
      {submitState === 'success' && (
        <div className="rounded-xl border border-green-300 bg-green-50 px-4 py-4 text-center space-y-1">
          <p className="text-2xl">&#x1F3B6;</p>
          <p className="font-semibold text-green-800 text-sm">
            {effectiveDuration} min session logged!
          </p>
          <p className="text-xs text-green-700">{motivation}</p>
        </div>
      )}

      {/* Stats */}
      {loadingHistory ? (
        <div className="grid grid-cols-2 gap-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : stats ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="card text-center py-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-1">
              Current Streak
            </p>
            <p className="text-3xl font-bold text-saffron-600 mb-1">
              {stats.currentStreak}
            </p>
            <StreakFlame count={stats.currentStreak} />
            <p className="text-xs text-gray-400 mt-1">days</p>
          </div>
          <div className="card text-center py-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-1">
              Best Streak
            </p>
            <p className="text-3xl font-bold text-charcoal">{stats.longestStreak}</p>
            <p className="text-xs text-gray-400 mt-1">days</p>
          </div>
          <div className="card text-center py-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-1">
              Total Sessions
            </p>
            <p className="text-3xl font-bold text-charcoal">{stats.totalSessions}</p>
            <p className="text-xs text-gray-400 mt-1">sessions</p>
          </div>
          <div className="card text-center py-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-1">
              Total Practice
            </p>
            <p className="text-3xl font-bold text-charcoal">
              {stats.totalMinutes >= 60
                ? `${Math.floor(stats.totalMinutes / 60)}h`
                : `${stats.totalMinutes}m`}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {stats.totalMinutes >= 60
                ? `${stats.totalMinutes % 60}m remaining`
                : 'minutes'}
            </p>
          </div>
        </div>
      ) : null}

      {/* AI Pitch Check */}
      <div className="card border-teal-200 bg-teal-50 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-heading font-semibold text-teal-900 text-sm">
              🎵 AI Swara Pitch Check
            </h2>
            <p className="text-xs text-teal-700 mt-0.5">
              Practice S R G M P D N in Maya Malava Gowla Ragam and get AI feedback on your pitch.
            </p>
          </div>
          <button
            type="button"
            onClick={() => { setShowPitchCheck((v) => !v); setPitchFeedback(null); }}
            className="text-xs text-teal-700 underline hover:no-underline flex-shrink-0"
          >
            {showPitchCheck ? 'Hide' : 'Open'}
          </button>
        </div>

        {showPitchCheck && (
          <div className="space-y-3 pt-1 border-t border-teal-200">
            {/* Pitch selector */}
            <div>
              <p className="text-xs font-semibold text-teal-800 mb-1.5">
                Select your Sa (tonic pitch)
              </p>
              <div className="flex flex-wrap gap-1.5">
                {SA_PITCHES.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setSelectedPitch(p)}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                      selectedPitch === p
                        ? 'bg-teal-700 text-white'
                        : 'bg-white border border-teal-300 text-teal-700 hover:bg-teal-100'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-teal-600 mt-1">
                Ragam: Maya Malava Gowla · Swaras: S R₂ G₃ M₁ P D₁ N₃
              </p>
            </div>

            {/* Observations input */}
            <div>
              <label className="block text-xs font-semibold text-teal-800 mb-1">
                Your observations <span className="font-normal text-teal-600">(optional)</span>
              </label>
              <textarea
                className="input text-xs min-h-[60px]"
                placeholder="e.g. My Ga feels flat, Ni is unstable, Sa is clear…"
                value={pitchObservations}
                onChange={(e) => setPitchObservations(e.target.value)}
                maxLength={300}
              />
            </div>

            <button
              type="button"
              onClick={handlePitchCheck}
              disabled={pitchLoading}
              className="btn-primary w-full text-sm bg-teal-700 hover:bg-teal-800 focus:ring-teal-500"
            >
              {pitchLoading ? '🎵 Getting AI feedback…' : '🎵 Get Pitch Feedback'}
            </button>

            {pitchError && (
              <p className="text-xs text-red-600 bg-red-50 rounded px-3 py-2">{pitchError}</p>
            )}

            {pitchFeedback && (
              <div className="bg-white rounded-xl border border-teal-200 px-4 py-4 text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">
                {pitchFeedback}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Log form */}
      <form onSubmit={handleSubmit} className="card space-y-5">
        <h2 className="section-title">Log Today&rsquo;s Practice</h2>

        {/* Duration presets */}
        <div>
          <p className="text-sm font-medium text-charcoal mb-2">
            Duration <span className="text-red-500">*</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {DURATION_PRESETS.map((mins) => (
              <button
                key={mins}
                type="button"
                onClick={() => { setUseCustom(false); setDuration(mins); }}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                  !useCustom && duration === mins
                    ? 'bg-saffron-600 text-white border-saffron-600'
                    : 'bg-white text-charcoal border-gray-300 hover:border-saffron-400'
                }`}
              >
                {mins} min
              </button>
            ))}
            <button
              type="button"
              onClick={() => setUseCustom(true)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                useCustom
                  ? 'bg-saffron-600 text-white border-saffron-600'
                  : 'bg-white text-charcoal border-gray-300 hover:border-saffron-400'
              }`}
            >
              Custom
            </button>
          </div>

          {useCustom && (
            <div className="mt-3 flex items-center gap-2">
              <input
                type="number"
                className="input w-24"
                placeholder="e.g. 75"
                min={1}
                max={480}
                value={customDuration}
                onChange={(e) => setCustomDuration(e.target.value)}
                autoFocus
              />
              <span className="text-sm text-gray-500">minutes</span>
            </div>
          )}
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-charcoal mb-1.5">
            Notes <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <textarea
            className="input min-h-[72px] resize-y"
            placeholder="What did you practice? (e.g. Saraswati Namastubhyam, swaravali in Kalyani…)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={500}
          />
          <p className="text-xs text-gray-400 text-right mt-0.5">{notes.length}/500</p>
        </div>

        {/* Error */}
        {submitState === 'error' && submitError && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
            &#9888;&#65039; {submitError}
          </p>
        )}

        <button
          type="submit"
          className="btn-primary w-full"
          disabled={
            submitState === 'loading' ||
            effectiveDuration < 1 ||
            (useCustom && !customDuration)
          }
        >
          {submitState === 'loading' ? 'Logging…' : `Log ${effectiveDuration > 0 ? `${effectiveDuration} min` : ''} Session`}
        </button>
      </form>

      {/* Recent check-ins */}
      <section>
        <h2 className="section-title mb-3">Recent Sessions</h2>

        {fetchError && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-3">
            &#9888;&#65039; {fetchError}
          </p>
        )}

        {loadingHistory ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="card animate-pulse flex items-center justify-between py-3">
                <div className="h-3 w-24 bg-gray-200 rounded" />
                <div className="h-5 w-16 bg-gray-200 rounded-full" />
              </div>
            ))}
          </div>
        ) : checkins.length === 0 ? (
          <div className="card text-center text-gray-400 py-10 text-sm">
            <p className="text-2xl mb-2">&#x1F3A4;</p>
            No sessions logged yet. Start your first riyaz today!
          </div>
        ) : (
          <div className="card p-0 overflow-hidden">
            <ul className="divide-y divide-gray-100">
              {checkins.slice(0, 10).map((c) => (
                <li
                  key={c.id}
                  className="flex items-start justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-charcoal">
                      {c.durationMinutes ?? c.duration ?? 0} min practice
                    </p>
                    {c.notes && (
                      <p className="text-xs text-gray-500 mt-0.5 truncate">
                        {c.notes}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 flex-shrink-0 mt-0.5">
                    {formatRelative(c.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
