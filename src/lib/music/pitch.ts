/**
 * Pitch detection for singing (YIN), with removal of the app's own tanpura
 * drone from the microphone signal. Shared by the Riyaz tuner (live) and the
 * recording review (offline). Browser- and server-safe (no DOM APIs).
 */

function parabolicInterp(buf: Float32Array<ArrayBuffer>, tau: number): number {
  if (tau < 1 || tau >= buf.length - 1) return tau;
  const s0 = buf[tau - 1], s1 = buf[tau], s2 = buf[tau + 1];
  const denom = 2 * (2 * s1 - s2 - s0);
  return denom === 0 ? tau : tau + (s2 - s0) / denom;
}

/**
 * The tanpura drone this page plays: [frequency multiple of Sa, detune in cents].
 * Each string also gets a soft partial one octave up (see startTanpura).
 * Shared with the pitch detector so it can remove exactly these tones.
 */
export const TANPURA_STRINGS: Array<[number, number]> = [
  [3 / 2, 0], // Pa
  [2, -3],    // Sa' (slightly flat)
  [2, 3],     // Sa' (slightly sharp)
  [1, 0],     // Sa
];

/** Every frequency the drone produces for a given Sa (strings + octave partials). */
export function tanpuraPartials(saHz: number): number[] {
  const out: number[] = [];
  for (const [mult, detune] of TANPURA_STRINGS) {
    out.push(saHz * mult * Math.pow(2, detune / 1200));
    out.push(saHz * mult * 2);
  }
  return out;
}

export function rmsOf(buf: Float32Array): number {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / buf.length);
}

/**
 * Removing the drone from the mic signal: a joint least-squares fit of sin/cos
 * at every drone frequency, subtracted from the buffer. Joint (not one tone at
 * a time) so the two Sa' strings only 6¢ apart are removed cleanly. The basis
 * and the factorised normal matrix depend only on Sa / buffer size / sample
 * rate, so they're computed once and cached; each frame is then cheap.
 */
type ToneRemover = { basis: Float32Array[]; inv: Float64Array; k: number };
let toneRemoverCache: { key: string; remover: ToneRemover } | null = null;

function getToneRemover(freqs: number[], n: number, sampleRate: number): ToneRemover {
  const key = `${freqs.map((f) => f.toFixed(4)).join(',')}|${n}|${sampleRate}`;
  if (toneRemoverCache?.key === key) return toneRemoverCache.remover;
  const fs = freqs.filter((f) => f > 0 && f < sampleRate / 2);
  const basis: Float32Array[] = [];
  for (const f of fs) {
    const w = (2 * Math.PI * f) / sampleRate;
    const sn = new Float32Array(n), cs = new Float32Array(n);
    for (let i = 0; i < n; i++) { sn[i] = Math.sin(w * i); cs[i] = Math.cos(w * i); }
    basis.push(sn, cs);
  }
  const k = basis.length;
  // Normal matrix BᵀB (+ tiny ridge), inverted once by Gauss–Jordan
  const m = new Float64Array(k * 2 * k);
  for (let p = 0; p < k; p++) {
    for (let q = p; q < k; q++) {
      let v = 0;
      const bp = basis[p], bq = basis[q];
      for (let i = 0; i < n; i++) v += bp[i] * bq[i];
      m[p * 2 * k + q] = v;
      m[q * 2 * k + p] = v;
    }
    m[p * 2 * k + p] += 1e-6 * n;
    m[p * 2 * k + k + p] = 1;
  }
  for (let col = 0; col < k; col++) {
    let piv = col;
    for (let r = col + 1; r < k; r++) if (Math.abs(m[r * 2 * k + col]) > Math.abs(m[piv * 2 * k + col])) piv = r;
    if (piv !== col) {
      for (let c = 0; c < 2 * k; c++) {
        const t = m[col * 2 * k + c]; m[col * 2 * k + c] = m[piv * 2 * k + c]; m[piv * 2 * k + c] = t;
      }
    }
    const d = m[col * 2 * k + col];
    if (Math.abs(d) < 1e-12) continue;
    for (let c = 0; c < 2 * k; c++) m[col * 2 * k + c] /= d;
    for (let r = 0; r < k; r++) {
      if (r === col) continue;
      const f = m[r * 2 * k + col];
      if (!f) continue;
      for (let c = 0; c < 2 * k; c++) m[r * 2 * k + c] -= f * m[col * 2 * k + c];
    }
  }
  const inv = new Float64Array(k * k);
  for (let r = 0; r < k; r++) for (let c = 0; c < k; c++) inv[r * k + c] = m[r * 2 * k + k + c];
  const remover = { basis, inv, k };
  toneRemoverCache = { key, remover };
  return remover;
}

function removeTones(buffer: Float32Array, sampleRate: number, freqs: number[]): Float32Array {
  const n = buffer.length;
  const { basis, inv, k } = getToneRemover(freqs, n, sampleRate);
  if (k === 0) return buffer;
  const rhs = new Float64Array(k);
  for (let p = 0; p < k; p++) {
    const bp = basis[p];
    let v = 0;
    for (let i = 0; i < n; i++) v += bp[i] * buffer[i];
    rhs[p] = v;
  }
  const out = Float32Array.from(buffer);
  for (let p = 0; p < k; p++) {
    let coef = 0;
    for (let q = 0; q < k; q++) coef += inv[p * k + q] * rhs[q];
    if (!coef) continue;
    const bp = basis[p];
    for (let i = 0; i < n; i++) out[i] -= coef * bp[i];
  }
  return out;
}

/** YIN (de Cheveigné & Kawahara, 2002): first confident valley, else the deepest usable one. */
function yinPitch(buffer: Float32Array, sampleRate: number): number {
  const SIZE = buffer.length;
  if (rmsOf(buffer) < 0.01) return -1;
  const W = Math.floor(SIZE / 2);
  const tauMin = Math.floor(sampleRate / 1200);
  const tauMax = Math.min(W - 1, Math.floor(sampleRate / 60));
  // Only lags up to the lowest singable pitch (60 Hz) are needed — computing
  // all W lags made each frame ~5× slower than the 16 ms display budget.
  const d = new Float32Array(tauMax + 2);
  d[0] = 1;
  let runningSum = 0;
  for (let tau = 1; tau < tauMax + 2; tau++) {
    let sum = 0;
    for (let i = 0; i < W; i++) {
      const delta = buffer[i] - buffer[i + tau];
      sum += delta * delta;
    }
    runningSum += sum;
    d[tau] = (sum * tau) / runningSum;
  }
  const STRICT = 0.15;
  const LOOSE = 0.35;
  let deepest = -1;
  let deepestVal = LOOSE;
  for (let tau = tauMin + 1; tau < tauMax - 1; tau++) {
    if (d[tau] <= d[tau + 1] && d[tau] < d[tau - 1]) {
      if (d[tau] < STRICT) return sampleRate / parabolicInterp(d, tau);
      if (d[tau] < deepestVal) { deepestVal = d[tau]; deepest = tau; }
    }
  }
  return deepest > 0 ? sampleRate / parabolicInterp(d, deepest) : -1;
}

/**
 * Pitch of the singer's voice. When the tanpura is on, its exact tones are
 * first subtracted from the mic signal (they leak in from the speakers), so
 * YIN hears only the voice. If almost nothing is left after subtraction, the
 * singer is sitting right on the drone's notes, so the full signal is used.
 *
 * Checked offline against synthetic singing for every swara of the raga, in
 * mandra/madhya/tara, Sa = C3…C4, with the drone up to twice as loud as the
 * voice plus vibrato: right swara and octave in every case, within ~3¢.
 */
export function detectPitchFromBuffer(
  buffer: Float32Array<ArrayBuffer>,
  sampleRate: number,
  tanpuraFreqs?: number[],
): number {
  if (rmsOf(buffer) < 0.01) return -1;
  if (tanpuraFreqs && tanpuraFreqs.length > 0) {
    const residual = removeTones(buffer, sampleRate, tanpuraFreqs);
    if (rmsOf(residual) >= 0.01) {
      const f = yinPitch(residual, sampleRate);
      if (f > 0) return f;
    }
  }
  return yinPitch(buffer, sampleRate);
}

