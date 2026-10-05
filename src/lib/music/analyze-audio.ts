/**
 * Browser-only: decode a recording (Blob / ArrayBuffer) to 16 kHz mono and
 * run the pitch analysis on it.
 */

import { analyzeSamples, type RecordingAnalysis } from './analyze';
import { findRaga } from './ragas';

const RATE = 16000;

export async function decodeTo16kMono(data: Blob | ArrayBuffer): Promise<Float32Array> {
  const buf = data instanceof Blob ? await data.arrayBuffer() : data;
  type Ctx = typeof AudioContext;
  const AC: Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: Ctx }).webkitAudioContext;
  const ctx = new AC();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(buf.slice(0));
  } finally {
    ctx.close().catch(() => {});
  }
  const length = Math.max(1, Math.ceil(decoded.duration * RATE));
  const offline = new OfflineAudioContext(1, length, RATE);
  const src = offline.createBufferSource();
  src.buffer = decoded; // multi-channel input is down-mixed to mono
  src.connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0);
}

export async function analyzeRecording(
  data: Blob | ArrayBuffer,
  saHz: number,
  ragaName: string | null | undefined,
  onProgress?: (p: number) => void,
): Promise<RecordingAnalysis> {
  const samples = await decodeTo16kMono(data);
  const raga = ragaName ? findRaga(ragaName) : null;
  return analyzeSamples(samples, saHz, raga?.swaras ?? null, raga?.name ?? null, onProgress);
}
