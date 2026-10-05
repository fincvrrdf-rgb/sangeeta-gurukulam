/**
 * Offline analysis of a practice recording: pitch-tracks the audio with the
 * same detector as the Riyaz tuner, groups readings into sung notes, and
 * measures intonation per swara against the raga and the student's Sa.
 * Produces measurements plus rule-based "preliminary review points" (the AI
 * review builds on these). Pure computation — runs in the browser.
 *
 * Carnatic singing uses gamakas (intentional oscillations), so deviations on
 * ornamented swaras are expected; the review points say so.
 */

import { detectPitchFromBuffer } from './pitch';
import type { SwaraDef } from './ragas';
import { ALL_SWARASTHANAS } from './ragas';

export interface SwaraStat {
  name: string;
  /** Median signed cents from the swara's correct pitch (+ sharp, − flat) */
  medianCents: number;
  /** Typical wobble within held notes (cents) */
  spreadCents: number;
  /** Seconds spent on this swara */
  seconds: number;
}

export interface RecordingAnalysis {
  version: 1;
  saHz: number;
  ragaName: string | null;
  durationSec: number;
  singingSec: number;
  /** Share of sung time within ±15¢ of the intended swara */
  inTunePct: number;
  /** Median absolute deviation across all held notes */
  typicalOffCents: number;
  swaras: SwaraStat[];
  /** Sung notes nearer a swarasthana that isn't in the raga */
  outOfRagaSec: number;
  outOfRagaNames: string[];
  /** Change in Sa intonation from the first third to the last third (cents) */
  saDriftCents: number | null;
  lowestNote: string | null;
  highestNote: string | null;
  longestPauseSec: number;
}

const TARGET_RATE = 16000;
const FRAME = 1024; // 64 ms at 16 kHz
const HOP = 512; // 32 ms

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function nearestSwara(freq: number, saHz: number, swaras: SwaraDef[]) {
  let best = swaras[0];
  let bestCents = Infinity;
  let bestOctave = 0;
  for (const sw of swaras) {
    const base = saHz * sw.ratio;
    const k = Math.round(Math.log2(freq / base));
    const c = 1200 * Math.log2(freq / (base * Math.pow(2, k)));
    if (Math.abs(c) < Math.abs(bestCents)) {
      bestCents = c;
      best = sw;
      bestOctave = k + Math.floor(Math.log2(sw.ratio));
    }
  }
  return { swara: best, cents: bestCents, octave: bestOctave };
}

const OCTAVE_LABEL = (o: number) => (o < 0 ? 'mandra' : o > 0 ? 'tara' : 'madhya');

/**
 * Analyse mono samples at TARGET_RATE (16 kHz). `onProgress` gets 0..1 and the
 * loop yields periodically so the page stays responsive.
 */
export async function analyzeSamples(
  samples: Float32Array,
  saHz: number,
  ragaSwaras: SwaraDef[] | null,
  ragaName: string | null,
  onProgress?: (p: number) => void,
): Promise<RecordingAnalysis> {
  const swaras = ragaSwaras && ragaSwaras.length ? ragaSwaras : ALL_SWARASTHANAS;
  const frames: Array<{ t: number; freq: number } | null> = [];
  const frameBuf = new Float32Array(FRAME);
  const total = Math.max(0, Math.floor((samples.length - FRAME) / HOP) + 1);

  for (let f = 0; f < total; f++) {
    const start = f * HOP;
    frameBuf.set(samples.subarray(start, start + FRAME));
    const hz = detectPitchFromBuffer(frameBuf as Float32Array<ArrayBuffer>, TARGET_RATE);
    frames.push(hz > 60 && hz < 1200 ? { t: start / TARGET_RATE, freq: hz } : null);
    if (f % 200 === 0) {
      onProgress?.(f / Math.max(1, total));
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  onProgress?.(1);

  // Group consecutive voiced frames on the same swara (+octave) into notes
  type Note = { swara: SwaraDef; octave: number; cents: number[]; start: number; end: number };
  const notes: Note[] = [];
  let cur: Note | null = null;
  let longestPause = 0;
  let pauseStart: number | null = null;
  const frameSec = HOP / TARGET_RATE;

  for (let i = 0; i < frames.length; i++) {
    const fr = frames[i];
    const t = i * frameSec;
    if (!fr) {
      if (cur) { notes.push(cur); cur = null; }
      if (pauseStart === null) pauseStart = t;
      continue;
    }
    if (pauseStart !== null) {
      longestPause = Math.max(longestPause, t - pauseStart);
      pauseStart = null;
    }
    const n = nearestSwara(fr.freq, saHz, swaras);
    if (cur && cur.swara.symbol === n.swara.symbol && cur.octave === n.octave) {
      cur.cents.push(n.cents);
      cur.end = t + frameSec;
    } else {
      if (cur) notes.push(cur);
      cur = { swara: n.swara, octave: n.octave, cents: [n.cents], start: t, end: t + frameSec };
    }
  }
  if (cur) notes.push(cur);

  // Held notes only (≥ ~130 ms) — skips glides between swaras
  const held = notes.filter((n) => n.cents.length >= 4);
  const singingSec = held.reduce((s, n) => s + (n.end - n.start), 0);

  // Out-of-raga: held notes much nearer a swarasthana outside the raga.
  // They're reported separately and not counted against the nearest raga swara.
  let outOfRagaSec = 0;
  const outNames = new Set<string>();
  const outOfRaga = new Set<Note>();
  if (ragaSwaras && ragaSwaras.length) {
    const inRaga = new Set(ragaSwaras.map((s) => Math.round(1200 * Math.log2(s.ratio))));
    for (const n of held) {
      const m = median(n.cents);
      const chroma = nearestSwara(saHz * n.swara.ratio * Math.pow(2, m / 1200), saHz, ALL_SWARASTHANAS);
      const pos = Math.round(1200 * Math.log2(chroma.swara.ratio));
      if (!inRaga.has(pos) && Math.abs(chroma.cents) < 30 && Math.abs(m) > 60) {
        outOfRagaSec += n.end - n.start;
        outNames.add(chroma.swara.name);
        outOfRaga.add(n);
      }
    }
  }
  const inRagaHeld = held.filter((n) => !outOfRaga.has(n));

  const bySwara = new Map<string, { sw: SwaraDef; cents: number[]; spreads: number[]; sec: number }>();
  for (const n of inRagaHeld) {
    // Trim the first/last frame of each note (attack/release)
    const core = n.cents.length > 4 ? n.cents.slice(1, -1) : n.cents;
    const e = bySwara.get(n.swara.symbol) ?? { sw: n.swara, cents: [], spreads: [], sec: 0 };
    e.cents.push(...core);
    const m = median(core);
    e.spreads.push(median(core.map((c) => Math.abs(c - m))));
    e.sec += n.end - n.start;
    bySwara.set(n.swara.symbol, e);
  }

  const swaraStats: SwaraStat[] = swaras
    .filter((sw) => bySwara.has(sw.symbol))
    .map((sw) => {
      const e = bySwara.get(sw.symbol)!;
      return {
        name: sw.name,
        medianCents: Math.round(median(e.cents)),
        spreadCents: Math.round(median(e.spreads)),
        seconds: Math.round(e.sec * 10) / 10,
      };
    });

  const allCents = inRagaHeld.flatMap((n) => n.cents);
  const inTunePct = allCents.length ? Math.round((100 * allCents.filter((c) => Math.abs(c) <= 15).length) / allCents.length) : 0;

  // Sa drift: Sa intonation early vs late in the recording
  let saDrift: number | null = null;
  const saNotes = held.filter((n) => n.swara.ratio === 1 && n.octave === 0);
  const dur = samples.length / TARGET_RATE;
  const early = saNotes.filter((n) => n.start < dur / 3).flatMap((n) => n.cents);
  const late = saNotes.filter((n) => n.start > (2 * dur) / 3).flatMap((n) => n.cents);
  if (early.length >= 8 && late.length >= 8) saDrift = Math.round(median(late) - median(early));

  const ordered = [...held].sort((a, b) => (a.octave - b.octave) || (a.swara.ratio - b.swara.ratio));
  const label = (n: Note | undefined) => (n ? `${n.swara.name} (${OCTAVE_LABEL(n.octave)})` : null);

  return {
    version: 1,
    saHz,
    ragaName,
    durationSec: Math.round(dur * 10) / 10,
    singingSec: Math.round(singingSec * 10) / 10,
    inTunePct,
    typicalOffCents: Math.round(median(allCents.map(Math.abs))),
    swaras: swaraStats,
    outOfRagaSec: Math.round(outOfRagaSec * 10) / 10,
    outOfRagaNames: [...outNames],
    saDriftCents: saDrift,
    lowestNote: label(ordered[0]),
    highestNote: label(ordered[ordered.length - 1]),
    longestPauseSec: Math.round(longestPause * 10) / 10,
  };
}

/** Plain-language preliminary review points from the measurements (no AI needed). */
export function ruleBasedReviewPoints(a: RecordingAnalysis): string[] {
  const pts: string[] = [];
  if (a.singingSec < 5) {
    pts.push('Very little sustained singing was detected — check the microphone was close enough and the recording has the full exercise.');
    return pts;
  }
  pts.push(`Overall: ${a.inTunePct}% of held notes were within ±15¢ of the swara; typical deviation ${a.typicalOffCents}¢.`);
  const off = a.swaras.filter((s) => Math.abs(s.medianCents) > 15 && s.seconds >= 1)
    .sort((x, y) => Math.abs(y.medianCents) - Math.abs(x.medianCents));
  for (const s of off.slice(0, 4)) {
    pts.push(`${s.name} tends to be ${s.medianCents > 0 ? 'sharp' : 'flat'} by about ${Math.abs(s.medianCents)}¢ — ${s.medianCents > 0 ? 'bring it down' : 'lift it'} slightly.`);
  }
  const good = a.swaras.filter((s) => Math.abs(s.medianCents) <= 10 && s.seconds >= 1).map((s) => s.name);
  if (good.length) pts.push(`Well placed: ${good.join(', ')}.`);
  const wobbly = a.swaras.filter((s) => s.spreadCents > 25 && s.seconds >= 1).map((s) => s.name);
  if (wobbly.length) pts.push(`Unsteady held notes on ${wobbly.join(', ')} (this can also be intended gamaka — teacher to confirm).`);
  if (a.saDriftCents !== null && Math.abs(a.saDriftCents) >= 20) {
    pts.push(`Sa drifted ${a.saDriftCents > 0 ? 'up' : 'down'} by about ${Math.abs(a.saDriftCents)}¢ between the start and end — keep checking Sa against the shruti.`);
  }
  if (a.outOfRagaSec >= 1 && a.outOfRagaNames.length) {
    pts.push(`About ${a.outOfRagaSec}s landed on ${a.outOfRagaNames.join(', ')}, which ${a.outOfRagaNames.length > 1 ? 'are' : 'is'} not in ${a.ragaName ?? 'the raga'}.`);
  }
  if (a.lowestNote && a.highestNote) pts.push(`Range used: ${a.lowestNote} to ${a.highestNote}.`);
  return pts;
}
