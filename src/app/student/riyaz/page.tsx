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

import { useEffect, useState, useRef, useCallback, type FormEvent } from 'react';
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

// Base frequencies for each pitch (A4=440)
const PITCH_FREQS: Record<string, number> = {
  'C': 261.63, 'C#/Db': 277.18, 'D': 293.66, 'D#/Eb': 311.13,
  'E': 329.63, 'F': 349.23, 'F#/Gb': 369.99, 'G': 392.00,
  'G#/Ab': 415.30, 'A': 440.00, 'A#/Bb': 466.16, 'B': 493.88,
};

// Maya Malava Gowla swara ratios (just intonation)
// Raga: S R1 G3 M1 P D1 N3 S
//   Ri1 = Shuddha Rishabha  = 16/15 (minor second above Sa)
//   Ga3 = Antara Gandhara   = 5/4   (major third)
//   Ma1 = Shuddha Madhyama  = 4/3   (perfect fourth)
//   Pa  = Panchama          = 3/2   (perfect fifth)
//   Dha1 = Shuddha Dhaivata = 8/5   (minor sixth)
//   Ni3 = Kakali Nishada    = 15/8  (major seventh)
const SWARA_RATIOS = [
  { name: 'Sa',   symbol: 'S', ratio: 1 },
  { name: 'Ri₁',  symbol: 'R', ratio: 16/15 },
  { name: 'Ga₃',  symbol: 'G', ratio: 5/4 },
  { name: 'Ma₁',  symbol: 'M', ratio: 4/3 },
  { name: 'Pa',   symbol: 'P', ratio: 3/2 },
  { name: 'Dha₁', symbol: 'D', ratio: 8/5 },
  { name: 'Ni₃',  symbol: 'N', ratio: 15/8 },
  { name: 'Sa\'', symbol: 'Ṡ', ratio: 2 },
];

function freqToCents(detected: number, target: number): number {
  return Math.round(1200 * Math.log2(detected / target));
}

function parabolicInterp(buf: Float32Array<ArrayBuffer>, tau: number): number {
  if (tau < 1 || tau >= buf.length - 1) return tau;
  const s0 = buf[tau - 1], s1 = buf[tau], s2 = buf[tau + 1];
  const denom = 2 * (2 * s1 - s2 - s0);
  return denom === 0 ? tau : tau + (s2 - s0) / denom;
}

/**
 * YIN pitch detection algorithm.
 * Much more reliable than AMDF for vocal/instrument pitch tracking.
 * Reference: de Cheveigné & Kawahara, 2002.
 */
function detectPitchFromBuffer(buffer: Float32Array<ArrayBuffer>, sampleRate: number): number {
  const SIZE = buffer.length;

  // Silence gate — skip if signal too quiet
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buffer[i] * buffer[i];
  if (Math.sqrt(rms / SIZE) < 0.01) return -1;

  const W = Math.floor(SIZE / 2);

  // Step 1 & 2: cumulative mean normalized difference function
  const d = new Float32Array(W);
  d[0] = 1;
  let runningSum = 0;
  for (let tau = 1; tau < W; tau++) {
    let sum = 0;
    for (let i = 0; i < W; i++) {
      const delta = buffer[i] - buffer[i + tau];
      sum += delta * delta;
    }
    runningSum += sum;
    d[tau] = sum * tau / runningSum; // normalized
  }

  // Vocal range: ~60 Hz (bass) to ~1200 Hz (high soprano)
  const tauMin = Math.floor(sampleRate / 1200);
  const tauMax = Math.min(W - 1, Math.floor(sampleRate / 60));

  // Step 3: find first dip below threshold (0.15 is standard YIN value)
  const THRESHOLD = 0.15;
  for (let tau = tauMin; tau < tauMax; tau++) {
    if (d[tau] < THRESHOLD) {
      // Step 4: slide to local minimum
      while (tau + 1 < tauMax && d[tau + 1] < d[tau]) tau++;
      // Step 5: sub-sample via parabolic interpolation
      return sampleRate / parabolicInterp(d, tau);
    }
  }

  // Fallback: global minimum in range (accepts weaker threshold ≤ 0.5)
  let minVal = Infinity, minTau = -1;
  for (let tau = tauMin; tau < tauMax; tau++) {
    if (d[tau] < minVal) { minVal = d[tau]; minTau = tau; }
  }
  if (minTau !== -1 && minVal < 0.5) return sampleRate / parabolicInterp(d, minTau);

  return -1;
}

export default function RiyazPage() {
  const { user, apiFetch } = useAuthContext();

  const [checkins, setCheckins] = useState<RiyazCheckin[]>([]);
  const [stats, setStats] = useState<RiyazStats | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Tanpura + pitch tuner state
  const [showPitchCheck, setShowPitchCheck] = useState(false);
  const [selectedPitch, setSelectedPitch] = useState('C');
  const [tanpuraOn, setTanpuraOn] = useState(false);
  const [currentSwaraIdx, setCurrentSwaraIdx] = useState(0);
  const [detectedFreq, setDetectedFreq] = useState<number | null>(null);
  const [centsOff, setCentsOff] = useState<number | null>(null);
  const [micActive, setMicActive] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const tanpuraNodesRef = useRef<OscillatorNode[]>([]);
  const tanpuraGainRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const pitchBufferRef = useRef<Float32Array<ArrayBuffer> | null>(null);

  // AI feedback state (kept for post-session summary)
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

  const stopTanpura = useCallback(() => {
    tanpuraNodesRef.current.forEach(n => { try { n.stop(); } catch { /* already stopped */ } });
    tanpuraNodesRef.current = [];
    if (tanpuraGainRef.current) { tanpuraGainRef.current.disconnect(); tanpuraGainRef.current = null; }
  }, []);

  const stopMic = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    micStreamRef.current?.getTracks().forEach(t => t.stop());
    micStreamRef.current = null;
    analyserRef.current = null;
    setMicActive(false);
    setDetectedFreq(null);
    setCentsOff(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => () => {
    stopTanpura();
    stopMic();
    audioCtxRef.current?.close().catch(() => {});
  }, [stopTanpura, stopMic]);

  function getOrCreateAudioCtx(): AudioContext {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext();
    }
    audioCtxRef.current.resume();
    return audioCtxRef.current;
  }

  function startTanpura() {
    const saFreq = PITCH_FREQS[selectedPitch] ?? 261.63;
    const ctx = getOrCreateAudioCtx();
    const masterGain = ctx.createGain();
    masterGain.gain.value = 0.08;
    masterGain.connect(ctx.destination);
    tanpuraGainRef.current = masterGain;

    // Tanpura: Pa, Sa', Sa', Sa (each with slight detuning for warmth)
    const strings = [
      { freq: saFreq * 3/2, detune: 0 },
      { freq: saFreq * 2,   detune: -3 },
      { freq: saFreq * 2,   detune: 3 },
      { freq: saFreq,       detune: 0 },
    ];
    const nodes: OscillatorNode[] = [];
    strings.forEach(({ freq, detune }) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.detune.value = detune;
      // Add a small harmonic for richness
      const osc2 = ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.value = freq * 2;
      const g2 = ctx.createGain();
      g2.gain.value = 0.15;
      osc2.connect(g2);
      g2.connect(masterGain);
      osc2.start();
      nodes.push(osc2);
      osc.connect(masterGain);
      osc.start();
      nodes.push(osc);
    });
    tanpuraNodesRef.current = nodes;
    setTanpuraOn(true);
  }

  async function startMic() {
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      micStreamRef.current = stream;
      const ctx = getOrCreateAudioCtx();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 4096; // larger buffer → better resolution for low vocal frequencies
      source.connect(analyser);
      analyserRef.current = analyser;
      pitchBufferRef.current = new Float32Array(analyser.fftSize);
      setMicActive(true);

      function tick() {
        if (!analyserRef.current || !pitchBufferRef.current) return;
        analyserRef.current.getFloatTimeDomainData(pitchBufferRef.current);
        const freq = detectPitchFromBuffer(pitchBufferRef.current, ctx.sampleRate);
        if (freq > 50 && freq < 2000) {
          setDetectedFreq(Math.round(freq * 10) / 10);
          const saFreq = PITCH_FREQS[selectedPitch] ?? 261.63;
          const targetFreq = saFreq * SWARA_RATIOS[currentSwaraIdx].ratio;
          // Check octaves up/down
          let best = Infinity;
          for (const mult of [0.5, 1, 2, 4]) {
            const c = Math.abs(freqToCents(freq, targetFreq * mult));
            if (c < Math.abs(best)) best = freqToCents(freq, targetFreq * mult);
          }
          setCentsOff(best);
        } else {
          setDetectedFreq(null);
          setCentsOff(null);
        }
        rafRef.current = requestAnimationFrame(tick);
      }
      tick();
    } catch (e) {
      setMicError('Microphone access denied. Please allow mic access in your browser.');
    }
  }

  function toggleTanpura() {
    if (tanpuraOn) {
      stopTanpura();
      setTanpuraOn(false);
    } else {
      startTanpura();
    }
  }

  async function toggleMic() {
    if (micActive) {
      stopMic();
    } else {
      await startMic();
    }
  }

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

      {/* Tanpura + Live Pitch Tuner */}
      <div className="card border-teal-200 bg-teal-50 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-heading font-semibold text-teal-900 text-sm">
              🎵 Live Swara Pitch Tuner
            </h2>
            <p className="text-xs text-teal-700 mt-0.5">
              Tanpura drone + real-time tuner for SRGMPDN in Maya Malava Gowla
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (showPitchCheck) { stopTanpura(); stopMic(); setTanpuraOn(false); }
              setShowPitchCheck(v => !v);
              setPitchFeedback(null);
            }}
            className="text-xs text-teal-700 underline hover:no-underline flex-shrink-0"
          >
            {showPitchCheck ? 'Hide' : 'Open'}
          </button>
        </div>

        {showPitchCheck && (
          <div className="space-y-4 pt-1 border-t border-teal-200">
            {/* Sa Pitch selector */}
            <div>
              <p className="text-xs font-semibold text-teal-800 mb-2">1. Select your Sa (tonic pitch)</p>
              <div className="flex flex-wrap gap-1.5">
                {SA_PITCHES.map((p) => (
                  <button key={p} type="button"
                    onClick={() => { setSelectedPitch(p); stopTanpura(); setTanpuraOn(false); }}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                      selectedPitch === p ? 'bg-teal-700 text-white' : 'bg-white border border-teal-300 text-teal-700 hover:bg-teal-100'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-teal-600 mt-1">
                Sa = {selectedPitch} ({Math.round(PITCH_FREQS[selectedPitch] ?? 261)}Hz) · Maya Malava Gowla: S R₂ G₃ M₁ P D₁ N₃
              </p>
            </div>

            {/* Tanpura control */}
            <div>
              <p className="text-xs font-semibold text-teal-800 mb-2">2. Start the Tanpura drone for reference</p>
              <button
                type="button"
                onClick={toggleTanpura}
                className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                  tanpuraOn
                    ? 'bg-teal-700 text-white'
                    : 'bg-white border-2 border-teal-400 text-teal-800'
                }`}
              >
                {tanpuraOn ? '🔊 Tanpura Playing — Tap to Stop' : '🎶 Start Tanpura Drone'}
              </button>
              {tanpuraOn && (
                <p className="text-[10px] text-teal-600 mt-1 text-center">
                  Drone strings: Pa ({Math.round(PITCH_FREQS[selectedPitch] * 3/2)}Hz) · Sa' ({Math.round(PITCH_FREQS[selectedPitch] * 2)}Hz) · Sa ({Math.round(PITCH_FREQS[selectedPitch])}Hz)
                </p>
              )}
            </div>

            {/* Swara selector */}
            <div>
              <p className="text-xs font-semibold text-teal-800 mb-2">3. Select the swara you are singing</p>
              <div className="grid grid-cols-4 gap-1.5">
                {SWARA_RATIOS.map((s, i) => {
                  const targetFreq = (PITCH_FREQS[selectedPitch] ?? 261.63) * s.ratio;
                  return (
                    <button key={s.name} type="button"
                      onClick={() => { setCurrentSwaraIdx(i); setCentsOff(null); }}
                      className={`py-2 rounded-lg text-center transition-colors ${
                        currentSwaraIdx === i
                          ? 'bg-teal-700 text-white'
                          : 'bg-white border border-teal-300 text-teal-800 hover:bg-teal-100'
                      }`}
                    >
                      <div className="text-sm font-bold">{s.symbol}</div>
                      <div className="text-[9px] opacity-70">{Math.round(targetFreq)}Hz</div>
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-teal-600 mt-1">
                Now singing: <strong>{SWARA_RATIOS[currentSwaraIdx].name}</strong> ({Math.round((PITCH_FREQS[selectedPitch] ?? 261.63) * SWARA_RATIOS[currentSwaraIdx].ratio)} Hz)
              </p>
            </div>

            {/* Live tuner */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-teal-800">4. Sing and watch the tuner</p>
                <button type="button" onClick={toggleMic}
                  className={`text-xs px-3 py-1 rounded-lg font-medium transition-colors ${
                    micActive ? 'bg-red-100 text-red-700 border border-red-300' : 'bg-teal-600 text-white'
                  }`}
                >
                  {micActive ? '⏹ Stop Mic' : '🎤 Start Mic'}
                </button>
              </div>

              {micError && <p className="text-xs text-red-600 bg-red-50 rounded px-3 py-2 mb-2">{micError}</p>}

              {/* Tuner display */}
              <div className={`rounded-xl border-2 p-4 text-center transition-colors ${
                !micActive ? 'border-gray-200 bg-gray-50' :
                centsOff === null ? 'border-gray-300 bg-gray-50' :
                Math.abs(centsOff) <= 10 ? 'border-green-400 bg-green-50' :
                Math.abs(centsOff) <= 25 ? 'border-yellow-400 bg-yellow-50' :
                'border-red-400 bg-red-50'
              }`}>
                {!micActive ? (
                  <p className="text-gray-400 text-sm">Start mic to see tuner</p>
                ) : detectedFreq === null ? (
                  <div>
                    <p className="text-gray-400 text-sm">Sing into your mic…</p>
                    <div className="flex justify-center gap-1 mt-2">
                      {[1,2,3,4,5].map(i => (
                        <div key={i} className="w-1 bg-gray-200 rounded animate-pulse" style={{ height: `${8 + i * 4}px`, animationDelay: `${i * 100}ms` }} />
                      ))}
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Detected: {detectedFreq} Hz</p>
                    {/* Needle bar */}
                    <div className="relative w-full h-6 bg-gray-200 rounded-full overflow-hidden mb-2">
                      <div className="absolute top-0 left-1/2 w-0.5 h-full bg-gray-400 z-10" />
                      <div
                        className={`absolute top-0 w-3 h-full rounded-full transition-all duration-100 ${
                          Math.abs(centsOff ?? 999) <= 10 ? 'bg-green-500' :
                          Math.abs(centsOff ?? 999) <= 25 ? 'bg-yellow-500' : 'bg-red-500'
                        }`}
                        style={{ left: `calc(50% + ${Math.max(-48, Math.min(48, (centsOff ?? 0) * 0.4))}% - 6px)` }}
                      />
                    </div>
                    <p className={`text-lg font-bold ${
                      Math.abs(centsOff ?? 999) <= 10 ? 'text-green-700' :
                      Math.abs(centsOff ?? 999) <= 25 ? 'text-yellow-700' : 'text-red-700'
                    }`}>
                      {centsOff === null ? '—' :
                       Math.abs(centsOff) <= 10 ? '✓ In Tune' :
                       centsOff > 0 ? `+${centsOff}¢ Sharp` : `${centsOff}¢ Flat`}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* AI feedback after practice */}
            <div className="border-t border-teal-200 pt-3 space-y-2">
              <p className="text-xs font-semibold text-teal-800">Get AI coaching notes (optional)</p>
              <textarea
                className="input text-xs min-h-[56px]"
                placeholder="e.g. My Ga feels flat, Ni is unstable…"
                value={pitchObservations}
                onChange={(e) => setPitchObservations(e.target.value)}
                maxLength={300}
              />
              <button type="button" onClick={handlePitchCheck} disabled={pitchLoading}
                className="btn-primary w-full text-sm"
                style={{ background: '#0d7563' }}
              >
                {pitchLoading ? 'Getting feedback…' : '🤖 Get AI Coaching Notes'}
              </button>
              {pitchError && <p className="text-xs text-red-600 bg-red-50 rounded px-3 py-2">{pitchError}</p>}
              {pitchFeedback && (
                <div className="bg-white rounded-xl border border-teal-200 px-4 py-4 text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">
                  {pitchFeedback}
                </div>
              )}
            </div>
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
