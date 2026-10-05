/**
 * Riyaz Check-in — /student/riyaz
 *
 * Lets students log a personal practice (riyaz) session with a duration.
 * Shows a streak counter, recent check-in history, and a live swara pitch tuner.
 */

'use client';

import { useEffect, useState, useRef, useCallback, type FormEvent } from 'react';
import { useAuthContext } from '@/components/layout/AuthProvider';
import { SA_PITCHES, PITCH_FREQS, RAGAS, RAGA_NAMES, type SwaraDef } from '@/lib/music/ragas';
import { TANPURA_STRINGS, tanpuraPartials, detectPitchFromBuffer } from '@/lib/music/pitch';

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



function isKomalOrTeevra(ratio: number): boolean {
  const semitones = ((Math.round(12 * Math.log2(ratio)) % 12) + 12) % 12;
  return [1, 3, 6, 8, 10].includes(semitones);
}

function freqToCents(detected: number, target: number): number {
  return Math.round(1200 * Math.log2(detected / target));
}

function getSthāyi(freq: number, saFreq: number): string {
  const octaves = Math.log2(freq / saFreq);
  if (octaves < -0.42) return 'Mandra';
  if (octaves > 0.58) return 'Tara';
  return 'Madhya';
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
  const [selectedRaga, setSelectedRaga] = useState('Maya Malava Gowla');
  const [tanpuraOn, setTanpuraOn] = useState(false);
  const [detectedSwara, setDetectedSwara] = useState<SwaraDef | null>(null);
  const [detectedFreq, setDetectedFreq] = useState<number | null>(null);
  const [centsOff, setCentsOff] = useState<number | null>(null);
  // per-swara absolute cents deviation for the grid; symbol → cents
  const [swaraCentsMap, setSwaraCentsMap] = useState<Record<string, number>>({});
  const [micActive, setMicActive] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);

  const [playingSwaraSymbol, setPlayingSwaraSymbol] = useState<string | null>(null);
  // Target-practice mode: the swara the student clicked and is trying to sing.
  // null = auto-detect mode (meter grades against the nearest swara).
  const [targetSwara, setTargetSwara] = useState<SwaraDef | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const tanpuraNodesRef = useRef<OscillatorNode[]>([]);
  const tanpuraGainRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const pitchBufferRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const stopSwaraRef = useRef<(() => void) | null>(null);
  // Smoothed frequency: EMA over raw YIN detections to reduce per-frame jitter
  const smoothedFreqRef = useRef<number | null>(null);
  // Stability counter: swara must be detected consistently before display updates
  const swaraStabilityRef = useRef<{ symbol: string; count: number }>({ symbol: '', count: 0 });
  const [tanpuraVolume, setTanpuraVolume] = useState(0.06);

  // While a reference tone is playing through the speakers, detection is paused
  // so the meter doesn't grade the speaker output as the student's singing.
  const refToneUntilRef = useRef(0);

  // Refs keep tick() closure fresh when pitch/raga/tanpura/target change mid-session
  const selectedPitchRef = useRef(selectedPitch);
  const selectedRagaRef = useRef(selectedRaga);
  const tanpuraOnRef = useRef(tanpuraOn);
  const targetSwaraRef = useRef<SwaraDef | null>(targetSwara);
  // What the tuner measured this session, per swara: running sum of signed
  // cents and number of steady readings. Sent with the AI coaching request so
  // the advice is about how the student actually sang.
  const sessionStatsRef = useRef<Record<string, { sum: number; n: number }>>({});
  useEffect(() => { selectedPitchRef.current = selectedPitch; }, [selectedPitch]);
  useEffect(() => { selectedRagaRef.current = selectedRaga; }, [selectedRaga]);
  // A new raga or Sa starts a fresh set of measurements
  useEffect(() => { sessionStatsRef.current = {}; }, [selectedRaga, selectedPitch]);
  useEffect(() => { tanpuraOnRef.current = tanpuraOn; }, [tanpuraOn]);
  useEffect(() => { targetSwaraRef.current = targetSwara; }, [targetSwara]);

  // AI feedback state
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
    setDetectedSwara(null);
    setSwaraCentsMap({});
    setCentsOff(null);
  }, []);

  useEffect(() => () => {
    stopTanpura();
    stopMic();
    stopSwaraRef.current?.();
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
    masterGain.gain.value = tanpuraVolume;
    masterGain.connect(ctx.destination);
    tanpuraGainRef.current = masterGain;

    // Same strings the pitch detector removes from the mic signal
    const strings = TANPURA_STRINGS.map(([mult, detune]) => ({ freq: saFreq * mult, detune }));
    const nodes: OscillatorNode[] = [];
    strings.forEach(({ freq, detune }) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.detune.value = detune;
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
      // Disable browser audio processing — AGC, noise suppression, and echo
      // cancellation all distort the harmonic balance and corrupt YIN pitch
      // detection. Pitch detection needs the raw signal.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          // Echo cancellation removes the tanpura speaker output from the mic
          // so YIN hears only the voice. Without this, the tanpura bleeds into
          // the mic and every swara is detected as Sa.
          echoCancellation: true,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,
        },
        video: false,
      });
      micStreamRef.current = stream;
      const ctx = getOrCreateAudioCtx();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      // 8192 samples ≈ 170ms @ 48kHz — long enough for ~12 cycles of low notes
      // (60 Hz) and yields better frequency resolution for accurate detection.
      analyser.fftSize = 8192;
      source.connect(analyser);
      analyserRef.current = analyser;
      pitchBufferRef.current = new Float32Array(analyser.fftSize);
      setMicActive(true);

      function tick() {
        if (!analyserRef.current || !pitchBufferRef.current) return;

        // While a reference tone plays through the speakers, skip judging —
        // otherwise the meter would grade the speaker output as singing.
        if (performance.now() < refToneUntilRef.current) {
          smoothedFreqRef.current = null;
          swaraStabilityRef.current = { symbol: '', count: 0 };
          rafRef.current = requestAnimationFrame(tick);
          return;
        }

        analyserRef.current.getFloatTimeDomainData(pitchBufferRef.current);
        // When tanpura is on, pass its component frequencies so the detector
        // can reject them and isolate the singer's voice in the mic signal.
        // The target swara's frequency is protected from that rejection.
        const saHz = PITCH_FREQS[selectedPitchRef.current] ?? 261.63;
        const tFreqs = tanpuraOnRef.current ? tanpuraPartials(saHz) : undefined;
        const rawFreq = detectPitchFromBuffer(pitchBufferRef.current, ctx.sampleRate, tFreqs);

        if (rawFreq > 50 && rawFreq < 2000) {
          // EMA smoothing on raw frequency to reduce YIN jitter (~50-100 cents)
          const prev = smoothedFreqRef.current;
          const freq = prev === null ? rawFreq : prev * 0.4 + rawFreq * 0.6;
          smoothedFreqRef.current = freq;
          setDetectedFreq(Math.round(freq * 10) / 10);

          const saFreq = PITCH_FREQS[selectedPitchRef.current] ?? 261.63;
          const raga = RAGAS[selectedRagaRef.current] ?? RAGAS['Maya Malava Gowla'];
          const newCentsMap: Record<string, number> = {};
          let bestSwara: SwaraDef = raga.swaras[0];
          let bestAbs = Infinity;
          let bestSigned = 0;

          // Pin matching to the user's own octave so swara grid cells match
          // their actual sung pitch. Compute the octave offset of the smoothed
          // freq relative to Sa, then check each swara only in that octave
          // (plus immediate neighbours to handle pitches near octave boundaries).
          const octaves = Math.round(Math.log2(freq / saFreq));
          const octaveMults = [
            Math.pow(2, octaves - 1),
            Math.pow(2, octaves),
            Math.pow(2, octaves + 1),
          ];

          for (const sw of raga.swaras) {
            const targetBase = saFreq * sw.ratio;
            let closestAbs = Infinity;
            let closestSigned = 0;
            for (const mult of octaveMults) {
              const signed = freqToCents(freq, targetBase * mult);
              const abs = Math.abs(signed);
              if (abs < closestAbs) { closestAbs = abs; closestSigned = signed; }
            }
            newCentsMap[sw.symbol] = closestAbs;
            if (closestAbs < bestAbs) {
              bestAbs = closestAbs;
              bestSigned = closestSigned;
              bestSwara = sw;
            }
          }

          // Stability: only update displayed swara after 3 consecutive frames agree
          const st = swaraStabilityRef.current;
          if (bestSwara.symbol === st.symbol) {
            st.count = Math.min(st.count + 1, 4);
          } else {
            st.symbol = bestSwara.symbol;
            st.count = 1;
          }
          if (st.count >= 3) setDetectedSwara(bestSwara);

          setSwaraCentsMap(newCentsMap);

          // TARGET MODE: the needle measures deviation from the CLICKED swara,
          // not the nearest one. Singing Sa when the target is Ri reads ~-112¢
          // (wrong), instead of snapping to Sa and showing green.
          const target = targetSwaraRef.current;
          let needleSigned = bestSigned;
          if (target) {
            const tBase = saFreq * target.ratio;
            const k = Math.round(Math.log2(freq / tBase));
            needleSigned = freqToCents(freq, tBase * Math.pow(2, k));
          }

          // EMA smoothing on the signed cents for the needle (light smoothing
          // for responsive feedback while still damping single-frame outliers)
          setCentsOff(prev => prev === null ? needleSigned : prev * 0.5 + needleSigned * 0.5);

          // Record steady readings for the coaching summary: the target swara in
          // target mode, otherwise the swara the student is clearly singing.
          const statSymbol = target ? target.symbol : st.count >= 3 && bestAbs < 50 ? bestSwara.symbol : null;
          if (statSymbol && Math.abs(needleSigned) < 150) {
            const cur = sessionStatsRef.current[statSymbol] ?? { sum: 0, n: 0 };
            cur.sum += needleSigned;
            cur.n += 1;
            sessionStatsRef.current[statSymbol] = cur;
          }
        } else {
          smoothedFreqRef.current = null;
          swaraStabilityRef.current = { symbol: '', count: 0 };
          setDetectedFreq(null);
          setDetectedSwara(null);
          setSwaraCentsMap({});
          setCentsOff(null);
        }
        rafRef.current = requestAnimationFrame(tick);
      }
      tick();
    } catch {
      setMicError('Microphone access denied. Please allow mic access in your browser.');
    }
  }

  function toggleTanpura() {
    if (tanpuraOn) { stopTanpura(); setTanpuraOn(false); }
    else startTanpura();
  }

  async function toggleMic() {
    if (micActive) stopMic();
    else await startMic();
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
          saHz: PITCH_FREQS[selectedPitch] ?? 261.63,
          swarasAttempted: RAGAS[selectedRaga]?.swaras.map(s => s.symbol).join(' ') ?? 'S R G M P D N',
          swaras: (RAGAS[selectedRaga]?.swaras ?? []).map(s => ({ name: s.name, symbol: s.symbol, ratio: s.ratio })),
          // Readings are taken ~60×/s; only swaras sung for a moment or more count
          measured: (RAGAS[selectedRaga]?.swaras ?? [])
            .map(s => {
              const st = sessionStatsRef.current[s.symbol];
              return st && st.n >= 20 ? { name: s.name, avgCents: Math.round(st.sum / st.n), readings: st.n } : null;
            })
            .filter(Boolean),
          observations: pitchObservations.trim() || undefined,
          ragam: selectedRaga,
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

  const effectiveDuration = useCustom ? parseInt(customDuration, 10) || 0 : duration;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (effectiveDuration < 1) return;
    setSubmitState('loading');
    setSubmitError(null);
    try {
      const res = await apiFetch('/api/riyaz', {
        method: 'POST',
        body: JSON.stringify({ durationMinutes: effectiveDuration, notes: notes.trim() || undefined }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Server error (${res.status})`);
      }
      setMotivation(randomMotivation());
      setSubmitState('success');
      setNotes('');
      if (useCustom) setCustomDuration('');
      setLoadingHistory(true);
      loadHistory();
    } catch (err: unknown) {
      setSubmitState('error');
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }

  function playSwara(sw: SwaraDef) {
    if (stopSwaraRef.current) { stopSwaraRef.current(); stopSwaraRef.current = null; }

    const ctx = getOrCreateAudioCtx();
    const freq = (PITCH_FREQS[selectedPitch] ?? 261.63) * sw.ratio;
    const master = ctx.createGain();
    master.connect(ctx.destination);

    // Fundamental + harmonics for a flute-like tone
    ([[1, 0.5], [2, 0.18], [3, 0.06]] as [number, number][]).forEach(([mult, g]) => {
      const osc = ctx.createOscillator();
      const hg = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq * mult;
      hg.gain.value = g;
      osc.connect(hg);
      hg.connect(master);
      osc.start();
      setTimeout(() => { try { osc.stop(); } catch {} }, 2200);
    });

    const now = ctx.currentTime;
    master.gain.setValueAtTime(0, now);
    master.gain.linearRampToValueAtTime(1, now + 0.025);
    master.gain.exponentialRampToValueAtTime(0.45, now + 0.18);

    setPlayingSwaraSymbol(sw.symbol);
    // Pause the pitch judge while the tone (plus its release tail) is audible
    refToneUntilRef.current = performance.now() + 2400;

    const autoClear = setTimeout(() => {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
      master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.25);
      setPlayingSwaraSymbol(null);
    }, 1900);

    stopSwaraRef.current = () => {
      clearTimeout(autoClear);
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
      master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.2);
      refToneUntilRef.current = performance.now() + 400;
      setPlayingSwaraSymbol(null);
    };
  }

  const saFreq = PITCH_FREQS[selectedPitch] ?? 261.63;
  const ragaSwaras = RAGAS[selectedRaga]?.swaras ?? RAGAS['Maya Malava Gowla'].swaras;
  const smoothedCents = centsOff !== null ? Math.round(centsOff) : null;

  function swaraColor(symbol: string): 'green' | 'yellow' | 'orange' | 'dim' | 'neutral' {
    if (!micActive || detectedFreq === null) return 'neutral';
    const abs = swaraCentsMap[symbol];
    if (abs === undefined) return 'neutral';
    if (abs <= 15) return 'green';
    if (abs <= 30) return 'yellow';
    if (abs <= 55) return 'orange';
    return 'dim';
  }

  const colorClasses: Record<string, string> = {
    green:   'bg-green-100 border-green-400 text-green-800',
    yellow:  'bg-yellow-100 border-yellow-400 text-yellow-800',
    orange:  'bg-orange-100 border-orange-300 text-orange-700',
    dim:     'bg-gray-50 border-gray-200 text-gray-400',
    neutral: 'bg-white border-teal-100 text-teal-700',
  };

  return (
    <div className="max-w-lg mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="font-heading text-2xl font-bold text-charcoal">Riyaz Check-in</h1>
        <p className="text-sm text-gray-500 mt-1">
          Log your personal practice session and build a daily streak.
        </p>
      </div>

      {/* Success message */}
      {submitState === 'success' && (
        <div className="rounded-xl border border-green-300 bg-green-50 px-4 py-4 text-center space-y-1">
          <p className="text-2xl">&#x1F3B6;</p>
          <p className="font-semibold text-green-800 text-sm">{effectiveDuration} min session logged!</p>
          <p className="text-xs text-green-700">{motivation}</p>
        </div>
      )}

      {/* Stats */}
      {loadingHistory ? (
        <div className="grid grid-cols-2 gap-3">
          <SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard />
        </div>
      ) : stats ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="card text-center py-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-1">Current Streak</p>
            <p className="text-3xl font-bold text-saffron-600 mb-1">{stats.currentStreak}</p>
            <StreakFlame count={stats.currentStreak} />
            <p className="text-xs text-gray-400 mt-1">days</p>
          </div>
          <div className="card text-center py-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-1">Best Streak</p>
            <p className="text-3xl font-bold text-charcoal">{stats.longestStreak}</p>
            <p className="text-xs text-gray-400 mt-1">days</p>
          </div>
          <div className="card text-center py-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-1">Total Sessions</p>
            <p className="text-3xl font-bold text-charcoal">{stats.totalSessions}</p>
            <p className="text-xs text-gray-400 mt-1">sessions</p>
          </div>
          <div className="card text-center py-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-1">Total Practice</p>
            <p className="text-3xl font-bold text-charcoal">
              {stats.totalMinutes >= 60 ? `${Math.floor(stats.totalMinutes / 60)}h` : `${stats.totalMinutes}m`}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {stats.totalMinutes >= 60 ? `${stats.totalMinutes % 60}m remaining` : 'minutes'}
            </p>
          </div>
        </div>
      ) : null}

      {/* ── Swara Tuner ─────────────────────────────────────────── */}
      <div className="card border-teal-200 bg-teal-50 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-heading font-semibold text-teal-900 text-sm">
              🎵 Auto Swara Tuner
            </h2>
            <p className="text-xs text-teal-700 mt-0.5">
              Tanpura drone · auto-detects nearest swara · live raga grid
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

            {/* 1. Sa pitch */}
            <div>
              <p className="text-xs font-semibold text-teal-800 mb-2">1. Select your Sa (tonic)</p>
              <div className="flex flex-wrap gap-1.5">
                {SA_PITCHES.map((p) => (
                  <button key={p} type="button"
                    onClick={() => { setSelectedPitch(p); stopTanpura(); setTanpuraOn(false); }}
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
                Sa = {selectedPitch} · {Math.round(saFreq)} Hz
              </p>
            </div>

            {/* 2. Raga selector */}
            <div>
              <p className="text-xs font-semibold text-teal-800 mb-2">2. Select Raga</p>
              <div className="grid grid-cols-2 gap-1.5">
                {RAGA_NAMES.map((raga) => (
                  <button key={raga} type="button"
                    onClick={() => setSelectedRaga(raga)}
                    className={`px-2.5 py-2 rounded text-left text-xs font-medium transition-colors ${
                      selectedRaga === raga
                        ? 'bg-teal-700 text-white'
                        : 'bg-white border border-teal-300 text-teal-700 hover:bg-teal-100'
                    }`}
                  >
                    <div className="font-semibold leading-tight">{raga}</div>
                    <div className={`text-[9px] mt-0.5 leading-tight ${selectedRaga === raga ? 'opacity-70' : 'text-teal-500'}`}>
                      {RAGAS[raga].desc}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Swara Keyboard — click a key to hear it AND set it as the practice target */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-teal-800">
                  3. Swara Keyboard — click a key, listen, then sing it
                </p>
                {targetSwara && (
                  <button
                    type="button"
                    onClick={() => setTargetSwara(null)}
                    className="text-[10px] text-teal-700 border border-teal-400 rounded-full px-2 py-0.5 hover:bg-teal-100"
                  >
                    ✕ Clear target (auto)
                  </button>
                )}
              </div>
              <div className="flex gap-0.5 relative" style={{ height: '110px' }}>
                {ragaSwaras.map((sw) => {
                  const komal = isKomalOrTeevra(sw.ratio);
                  const isPlaying = playingSwaraSymbol === sw.symbol;
                  const isTarget = targetSwara?.symbol === sw.symbol;
                  const isDetected = detectedSwara?.symbol === sw.symbol && micActive && detectedFreq !== null;
                  const absCents = swaraCentsMap[sw.symbol];
                  const inTune = isDetected && absCents !== undefined && absCents <= 20;
                  return (
                    <button
                      key={sw.symbol}
                      type="button"
                      onClick={() => { playSwara(sw); setTargetSwara(sw); }}
                      style={{ height: komal ? '72px' : '110px' }}
                      className={`
                        flex-1 min-w-0 flex flex-col items-center justify-end pb-1.5 pt-1 rounded-b-lg border-2
                        transition-all duration-100 select-none text-center
                        ${komal
                          ? `border-gray-500 ${isPlaying ? 'bg-teal-600 border-teal-300 scale-95' : inTune ? 'bg-green-700 border-green-400' : isDetected ? 'bg-slate-600 border-slate-400' : 'bg-gray-800'}`
                          : `shadow-sm border-gray-300 ${isPlaying ? 'bg-teal-100 border-teal-400 scale-95' : inTune ? 'bg-green-100 border-green-400' : isDetected ? 'bg-blue-50 border-blue-300' : 'bg-white'}`
                        }
                        ${isTarget ? 'ring-2 ring-offset-1 ring-saffron-500' : ''}
                        active:scale-95 hover:brightness-110 cursor-pointer
                      `}
                    >
                      {isTarget && <span className="text-[9px] leading-none mb-0.5">🎯</span>}
                      <span className={`text-xs font-bold leading-tight ${komal ? 'text-white' : 'text-gray-800'}`}>
                        {sw.symbol}
                      </span>
                      <span className={`text-[8px] leading-none mt-0.5 ${komal ? 'text-gray-300' : 'text-gray-500'}`}>
                        {Math.round(saFreq * sw.ratio)}
                      </span>
                      {isDetected && absCents !== undefined && absCents <= 55 && (
                        <span className={`text-[8px] font-bold mt-0.5 ${
                          absCents <= 15 ? 'text-green-400' : absCents <= 30 ? 'text-yellow-400' : 'text-orange-400'
                        }`}>
                          {absCents <= 15 ? '✓' : `${absCents}¢`}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-teal-600 mt-1.5 text-center">
                {targetSwara
                  ? <>🎯 Target: <b>{targetSwara.name}</b> — the meter now checks YOUR voice against {targetSwara.symbol} only</>
                  : 'Click a key to set it as your practice target · White = Shuddha · Dark = Komal/Teevra'}
              </p>
            </div>

            {/* 4. Controls row */}
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={toggleTanpura}
                className={`py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                  tanpuraOn ? 'bg-teal-700 text-white' : 'bg-white border-2 border-teal-400 text-teal-800'
                }`}
              >
                {tanpuraOn ? '🔊 Stop Tanpura' : '🎶 Tanpura Drone'}
              </button>
              <button type="button" onClick={toggleMic}
                className={`py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                  micActive ? 'bg-red-500 text-white' : 'bg-teal-600 text-white'
                }`}
              >
                {micActive ? '⏹ Stop Mic' : '🎤 Start Mic'}
              </button>
            </div>

            {tanpuraOn && (
              <p className="text-[10px] text-teal-600 text-center -mt-2">
                Drone: Pa ({Math.round(saFreq * 3 / 2)} Hz) · Sa&apos; ({Math.round(saFreq * 2)} Hz) · Sa ({Math.round(saFreq)} Hz)
              </p>
            )}

            {/* Tanpura volume + headphone tip */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-3">
                <label className="text-[10px] text-teal-700 font-medium whitespace-nowrap w-24">
                  Tanpura vol: {Math.round(tanpuraVolume * 100)}%
                </label>
                <input
                  type="range" min={1} max={20} step={1}
                  value={Math.round(tanpuraVolume * 100)}
                  onChange={e => {
                    const v = parseInt(e.target.value, 10) / 100;
                    setTanpuraVolume(v);
                    if (tanpuraGainRef.current) tanpuraGainRef.current.gain.value = v;
                  }}
                  className="flex-1 h-1 accent-teal-600"
                />
              </div>
              <p className="text-[10px] text-amber-700 bg-amber-50 rounded px-2 py-1">
                Tip: For accurate swara detection, use headphones — or lower the tanpura volume so your voice is louder than the speaker output.
              </p>
            </div>

            {micError && (
              <p className="text-xs text-red-600 bg-red-50 rounded px-3 py-2">{micError}</p>
            )}

            {/* Detected swara banner.
                In target mode smoothedCents measures deviation from the TARGET,
                so singing the wrong swara reads as a large error (red), never green. */}
            {micActive && (
              <div className={`rounded-xl border-2 p-4 text-center transition-all ${
                detectedFreq === null
                  ? 'border-gray-200 bg-gray-50'
                  : targetSwara && Math.abs(smoothedCents ?? 999) > 50
                    ? 'border-red-400 bg-red-50'
                    : smoothedCents === null || Math.abs(smoothedCents) > 50
                      ? 'border-gray-300 bg-gray-50'
                      : Math.abs(smoothedCents) <= 15
                        ? 'border-green-400 bg-green-50'
                        : Math.abs(smoothedCents) <= 30
                          ? 'border-yellow-400 bg-yellow-50'
                          : 'border-orange-400 bg-orange-50'
              }`}>
                {playingSwaraSymbol ? (
                  <div>
                    <p className="text-teal-700 text-sm font-medium">
                      🔊 Playing {playingSwaraSymbol} — listen…
                    </p>
                    <p className="text-[10px] text-teal-500 mt-1">Sing after the tone stops</p>
                  </div>
                ) : detectedFreq === null ? (
                  <div>
                    <p className="text-gray-400 text-sm">
                      {targetSwara ? `Sing ${targetSwara.name}…` : 'Sing into your mic…'}
                    </p>
                    <div className="flex justify-center gap-1 mt-2">
                      {[1, 2, 3, 4, 5].map(i => (
                        <div key={i} className="w-1 bg-gray-300 rounded animate-pulse"
                          style={{ height: `${8 + i * 4}px`, animationDelay: `${i * 100}ms` }} />
                      ))}
                    </div>
                  </div>
                ) : detectedSwara ? (
                  <div>
                    {targetSwara ? (
                      <>
                        {/* Target mode header: target vs what was actually sung */}
                        <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">
                          Target
                        </p>
                        <p className="text-4xl font-bold text-teal-800 leading-none mb-0.5">
                          {targetSwara.symbol}
                        </p>
                        <p className="text-sm text-teal-600 mb-0.5">{targetSwara.name}</p>
                        <p className={`text-xs mb-3 font-medium ${
                          detectedSwara.symbol === targetSwara.symbol ? 'text-green-700' : 'text-red-600'
                        }`}>
                          {detectedSwara.symbol === targetSwara.symbol
                            ? `You are singing ${detectedSwara.name} ✓`
                            : `✗ You are singing ${detectedSwara.name} — aim for ${targetSwara.name}`}
                          {' '}· {detectedFreq} Hz
                        </p>
                      </>
                    ) : (
                      <>
                        {/* Auto mode: show nearest swara */}
                        <p className="text-4xl font-bold text-teal-800 leading-none mb-0.5">
                          {detectedSwara.symbol}
                        </p>
                        <p className="text-sm text-teal-600 mb-0.5">{detectedSwara.name}</p>
                        <p className="text-[10px] text-teal-500 mb-3">
                          {detectedFreq} Hz · {getSthāyi(detectedFreq, saFreq)} Sthāyi
                        </p>
                      </>
                    )}

                    {/* Needle bar */}
                    <div className="relative w-full h-5 bg-gray-200 rounded-full overflow-hidden mb-2">
                      {/* tick marks at ±25¢ and ±50¢ */}
                      {[-50, -25, 25, 50].map(c => (
                        <div key={c} className="absolute top-0 w-px h-full bg-gray-300 opacity-60"
                          style={{ left: `calc(50% + ${c * 0.4}%)` }} />
                      ))}
                      <div className="absolute top-0 left-1/2 w-0.5 h-full bg-gray-500 z-10" />
                      <div
                        className={`absolute top-0 w-4 h-full rounded-full transition-all duration-100 ${
                          Math.abs(smoothedCents ?? 999) <= 15 ? 'bg-green-500' :
                          Math.abs(smoothedCents ?? 999) <= 30 ? 'bg-yellow-500' :
                          Math.abs(smoothedCents ?? 999) <= 50 ? 'bg-orange-500' : 'bg-red-500'
                        }`}
                        style={{ left: `calc(50% + ${Math.max(-46, Math.min(46, (smoothedCents ?? 0) * 0.4))}% - 8px)` }}
                      />
                    </div>
                    <p className={`text-base font-semibold ${
                      Math.abs(smoothedCents ?? 999) <= 15 ? 'text-green-700' :
                      Math.abs(smoothedCents ?? 999) <= 30 ? 'text-yellow-700' :
                      Math.abs(smoothedCents ?? 999) <= 50 ? 'text-orange-700' : 'text-red-600'
                    }`}>
                      {Math.abs(smoothedCents ?? 999) <= 15
                        ? '✓ In Tune'
                        : (smoothedCents ?? 0) > 0
                          ? `+${smoothedCents}¢ Sharp${targetSwara ? ` of ${targetSwara.symbol}` : ''}`
                          : `${smoothedCents}¢ Flat${targetSwara ? ` of ${targetSwara.symbol}` : ''}`}
                    </p>
                  </div>
                ) : null}
              </div>
            )}

            {/* Swara grid — all raga swaras simultaneously */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] text-teal-600 font-medium">
                  {selectedRaga} · {ragaSwaras.length} swaras
                </p>
                {micActive && detectedFreq !== null && (
                  <p className="text-[10px] text-teal-500">
                    <span className="inline-block w-2 h-2 rounded-full bg-green-400 mr-1" />≤15¢
                    <span className="inline-block w-2 h-2 rounded-full bg-yellow-400 ml-2 mr-1" />≤30¢
                    <span className="inline-block w-2 h-2 rounded-full bg-orange-400 ml-2 mr-1" />≤55¢
                  </p>
                )}
              </div>
              <div
                className="grid gap-1.5"
                style={{ gridTemplateColumns: `repeat(${ragaSwaras.length}, minmax(0, 1fr))` }}
              >
                {ragaSwaras.map((sw) => {
                  const col = swaraColor(sw.symbol);
                  const absCents = swaraCentsMap[sw.symbol];
                  const isDetected = detectedSwara?.symbol === sw.symbol && micActive && detectedFreq !== null;
                  return (
                    <div key={sw.symbol}
                      className={`py-2 px-0.5 rounded-lg text-center border-2 transition-all ${colorClasses[col]} ${
                        isDetected ? 'ring-2 ring-offset-1 ring-teal-400' : ''
                      }`}
                    >
                      <div className="text-sm font-bold leading-tight">{sw.symbol}</div>
                      <div className="text-[8px] opacity-70 leading-tight mt-0.5 truncate">{sw.name}</div>
                      <div className="text-[8px] opacity-50 leading-tight">
                        {Math.round(saFreq * sw.ratio)}Hz
                      </div>
                      {micActive && absCents !== undefined && absCents <= 55 && (
                        <div className={`text-[8px] font-semibold mt-0.5 ${
                          absCents <= 15 ? 'text-green-600' :
                          absCents <= 30 ? 'text-yellow-600' : 'text-orange-600'
                        }`}>
                          {absCents <= 15 ? '✓' : `${absCents}¢`}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {!micActive && (
                <p className="text-[10px] text-teal-500 mt-1.5 text-center">
                  Start mic → grid shows live pitch proximity for each swara
                </p>
              )}
            </div>

            {/* AI coaching notes */}
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

        <div>
          <p className="text-sm font-medium text-charcoal mb-2">
            Duration <span className="text-red-500">*</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {DURATION_PRESETS.map((mins) => (
              <button key={mins} type="button"
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
            <button type="button" onClick={() => setUseCustom(true)}
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
              <input type="number" className="input w-24" placeholder="e.g. 75"
                min={1} max={480} value={customDuration}
                onChange={(e) => setCustomDuration(e.target.value)} autoFocus />
              <span className="text-sm text-gray-500">minutes</span>
            </div>
          )}
        </div>

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

        {submitState === 'error' && submitError && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
            &#9888;&#65039; {submitError}
          </p>
        )}

        <button type="submit" className="btn-primary w-full"
          disabled={submitState === 'loading' || effectiveDuration < 1 || (useCustom && !customDuration)}
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
                <li key={c.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-charcoal">
                      {c.durationMinutes ?? c.duration ?? 0} min practice
                    </p>
                    {c.notes && (
                      <p className="text-xs text-gray-500 mt-0.5 truncate">{c.notes}</p>
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
