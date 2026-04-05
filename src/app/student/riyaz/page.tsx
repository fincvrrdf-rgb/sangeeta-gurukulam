/**
 * Riyaz Check-in — /student/riyaz
 *
 * Lets students log a personal practice (riyaz) session with a duration.
 * Shows a streak counter, recent check-in history, and a live swara pitch tuner.
 */

'use client';

import { useEffect, useState, useRef, useCallback, type FormEvent } from 'react';
import { useAuthContext } from '@/components/layout/AuthProvider';

interface RiyazCheckin {
  id: string;
  duration: number;   // minutes
  notes?: string;
  createdAt: string;  // ISO date string
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

// ============================================================
// Swara Pitch Tuner
// ============================================================

/**
 * Maya Malava Gowla ratios — Ri1 = 16/15, Ga3 = 5/4, Ma1 = 4/3,
 * Pa = 3/2, Dha1 = 8/5, Ni3 = 15/8, Sa(upper) = 2/1.
 * These ratios are multiplied by the user's chosen base Sa frequency.
 */
const SWARA_RATIOS: [string, number][] = [
  ['Sa',  1],
  ['Ri',  16/15],
  ['Ga',  5/4],
  ['Ma',  4/3],
  ['Pa',  3/2],
  ['Dha', 8/5],
  ['Ni',  15/8],
  ['Sa\u0307', 2],  // upper Sa
];

/** Base Sa presets — male voice ~130 Hz (C3), female voice ~260 Hz (C4) */
const VOICE_PRESETS: { label: string; freq: number }[] = [
  { label: 'Male Low (C3 — 130 Hz)', freq: 130.81 },
  { label: 'Male Mid (D3 — 147 Hz)', freq: 146.83 },
  { label: 'Female Low (C4 — 261 Hz)', freq: 261.63 },
  { label: 'Female Mid (D4 — 294 Hz)', freq: 293.66 },
];

/** YIN-like pitch detection from audio buffer */
function detectPitch(buffer: Float32Array, sampleRate: number): number {
  const W = Math.floor(buffer.length / 2);
  // RMS silence gate
  let rms = 0;
  for (let i = 0; i < buffer.length; i++) rms += buffer[i] * buffer[i];
  rms = Math.sqrt(rms / buffer.length);
  if (rms < 0.01) return -1;

  // YIN cumulative mean normalized difference
  const d = new Float32Array(W);
  d[0] = 1;
  let runSum = 0;
  for (let tau = 1; tau < W; tau++) {
    let sum = 0;
    for (let i = 0; i < W; i++) {
      const delta = buffer[i] - buffer[i + tau];
      sum += delta * delta;
    }
    runSum += sum;
    d[tau] = runSum === 0 ? 1 : (sum * tau) / runSum;
  }

  // Find first dip below threshold
  const threshold = 0.15;
  const minTau = Math.floor(sampleRate / 1200); // max 1200 Hz
  const maxTau = Math.floor(sampleRate / 60);    // min 60 Hz
  let bestTau = -1;
  for (let tau = minTau; tau < Math.min(maxTau, W); tau++) {
    if (d[tau] < threshold) {
      while (tau + 1 < W && d[tau + 1] < d[tau]) tau++;
      bestTau = tau;
      break;
    }
  }
  if (bestTau < 1) return -1;

  // Parabolic interpolation
  if (bestTau > 0 && bestTau < W - 1) {
    const s0 = d[bestTau - 1], s1 = d[bestTau], s2 = d[bestTau + 1];
    const denom = 2 * (2 * s1 - s2 - s0);
    if (denom !== 0) bestTau += (s2 - s0) / denom;
  }

  return sampleRate / bestTau;
}

/** Given a frequency and base Sa, return nearest swara & cents offset */
function freqToSwara(freq: number, baseSa: number): { swara: string; cents: number } | null {
  if (freq <= 0) return null;

  let bestSwara = '';
  let bestCents = Infinity;

  // Check current octave and one above/below
  for (const octMul of [0.5, 1, 2]) {
    for (const [name, ratio] of SWARA_RATIOS) {
      const target = baseSa * ratio * octMul;
      const cents = 1200 * Math.log2(freq / target);
      if (Math.abs(cents) < Math.abs(bestCents)) {
        bestCents = cents;
        bestSwara = octMul < 1 ? name.toLowerCase() : octMul > 1 && !name.includes('\u0307') ? name + '\u0307' : name;
      }
    }
  }

  return Math.abs(bestCents) < 100 ? { swara: bestSwara, cents: Math.round(bestCents) } : null;
}

function SwaraTuner() {
  const [baseSa, setBaseSa] = useState(261.63); // default female C4
  const [listening, setListening] = useState(false);
  const [detectedFreq, setDetectedFreq] = useState(-1);
  const [detectedSwara, setDetectedSwara] = useState<{ swara: string; cents: number } | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const rafRef = useRef<number>(0);

  const tick = useCallback(() => {
    if (!analyserRef.current || !audioCtxRef.current) return;
    const buf = new Float32Array(analyserRef.current.fftSize);
    analyserRef.current.getFloatTimeDomainData(buf);
    const freq = detectPitch(buf, audioCtxRef.current.sampleRate);
    setDetectedFreq(freq > 0 ? Math.round(freq * 10) / 10 : -1);
    setDetectedSwara(freq > 0 ? freqToSwara(freq, baseSa) : null);
    rafRef.current = requestAnimationFrame(tick);
  }, [baseSa]);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 4096;
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      sourceRef.current = source;
      setListening(true);
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      // microphone permission denied
    }
  }, [tick]);

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    sourceRef.current?.disconnect();
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
    analyserRef.current = null;
    sourceRef.current = null;
    setListening(false);
    setDetectedFreq(-1);
    setDetectedSwara(null);
  }, []);

  useEffect(() => {
    return () => { cancelAnimationFrame(rafRef.current); };
  }, []);

  // When baseSa changes and already listening, update the animation loop
  useEffect(() => {
    if (listening) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(tick);
    }
  }, [baseSa, listening, tick]);

  const centsColor = detectedSwara
    ? Math.abs(detectedSwara.cents) <= 15 ? 'text-green-600'
    : Math.abs(detectedSwara.cents) <= 40 ? 'text-yellow-600'
    : 'text-red-500'
    : 'text-gray-400';

  return (
    <div className="card space-y-4">
      <h2 className="section-title">Live Swara Tuner</h2>
      <p className="text-xs text-gray-500">
        Select your voice range, then sing to see which swara you are hitting.
      </p>

      {/* Voice preset selector */}
      <div>
        <label className="block text-sm font-medium text-charcoal mb-1.5">
          Voice Range (base Sa)
        </label>
        <select
          className="input"
          value={baseSa}
          onChange={(e) => setBaseSa(Number(e.target.value))}
        >
          {VOICE_PRESETS.map((p) => (
            <option key={p.freq} value={p.freq}>{p.label}</option>
          ))}
        </select>
        <p className="text-xs text-gray-400 mt-1">
          Sa = {baseSa.toFixed(1)} Hz. Female voices typically sit an octave above male voices for the same note.
        </p>
      </div>

      {/* Swara reference table */}
      <div className="flex flex-wrap gap-2">
        {SWARA_RATIOS.map(([name, ratio]) => (
          <span key={name} className={`px-2 py-1 rounded text-xs font-mono border ${
            detectedSwara?.swara === name ? 'bg-saffron-100 border-saffron-400 text-saffron-800 font-bold' : 'bg-gray-50 border-gray-200 text-gray-600'
          }`}>
            {name} {Math.round(baseSa * ratio)} Hz
          </span>
        ))}
      </div>

      {/* Pitch display */}
      <div className="text-center py-4 space-y-2">
        {listening ? (
          <>
            <p className="text-5xl font-bold text-charcoal">
              {detectedSwara ? detectedSwara.swara : (detectedFreq > 0 ? '...' : '---')}
            </p>
            {detectedFreq > 0 && (
              <p className="text-sm text-gray-500">
                {detectedFreq} Hz
                {detectedSwara && (
                  <span className={`ml-2 font-semibold ${centsColor}`}>
                    {detectedSwara.cents > 0 ? '+' : ''}{detectedSwara.cents} cents
                  </span>
                )}
              </p>
            )}
            {!detectedSwara && detectedFreq <= 0 && (
              <p className="text-sm text-gray-400">Listening... sing or hum into your mic</p>
            )}
          </>
        ) : (
          <p className="text-gray-400 text-sm">Tap Start to begin</p>
        )}
      </div>

      {/* Start/Stop button */}
      <button
        type="button"
        onClick={listening ? stop : start}
        className={listening ? 'btn-danger w-full' : 'btn-primary w-full'}
      >
        {listening ? 'Stop Tuner' : 'Start Tuner'}
      </button>
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

export default function RiyazPage() {
  const { user, apiFetch } = useAuthContext();

  const [checkins, setCheckins] = useState<RiyazCheckin[]>([]);
  const [stats, setStats] = useState<RiyazStats | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

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
          duration: effectiveDuration,
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

      {/* Live Swara Tuner */}
      <SwaraTuner />

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
                      {c.duration} min practice
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
