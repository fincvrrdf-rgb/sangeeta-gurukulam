/**
 * lib/ai/recording-review.ts — SERVER-ONLY
 *
 * Preliminary review points for a practice recording. The browser measures
 * the recording (src/lib/music/analyze.ts); here an AI turns those numbers
 * into short, encouraging points for the student and teacher. If the AI is
 * unavailable, the rule-based points from the same measurements are used.
 */

import { z } from 'zod';
import { callGroqSimple } from './groq';
import { ruleBasedReviewPoints, type RecordingAnalysis } from '@/lib/music/analyze';

export const AnalysisSchema = z.object({
  version: z.literal(1),
  saHz: z.number().positive().max(2000),
  ragaName: z.string().max(80).nullable(),
  durationSec: z.number().nonnegative(),
  singingSec: z.number().nonnegative(),
  inTunePct: z.number().min(0).max(100),
  typicalOffCents: z.number(),
  swaras: z.array(z.object({
    name: z.string().max(20),
    medianCents: z.number(),
    spreadCents: z.number(),
    seconds: z.number(),
  })).max(24),
  outOfRagaSec: z.number().nonnegative(),
  outOfRagaNames: z.array(z.string().max(20)).max(12),
  saDriftCents: z.number().nullable(),
  lowestNote: z.string().max(40).nullable(),
  highestNote: z.string().max(40).nullable(),
  longestPauseSec: z.number().nonnegative(),
});

export interface AiReview {
  points: string[];
  source: 'ai' | 'rules';
  generatedAt: string;
}

const SYSTEM = `You are an assistant to a Carnatic music teacher. You receive pitch measurements
from a student's practice recording (measured by software against the student's chosen Sa and the raga's swarasthanas).
Write 4–7 short PRELIMINARY review points for the student, in simple English.
Rules:
- Use only the numbers given; never invent anything about rhythm, lyrics, voice quality or the composition.
- Cents: + means sharp, − means flat. Within ±15¢ is good; 15–30¢ is noticeably off; >30¢ is clearly off.
- Carnatic swaras are often sung with gamakas, so a large spread or offset on a swara that is normally ornamented
  in this raga (e.g. Ga, Ni, Ri in many ragas) may be intentional — say "check with your teacher" rather than calling it wrong.
- Start with one encouraging point about what went well, then the most important corrections, then one practice tip
  (e.g. practise the off swara slowly against the tanpura/shruti).
- Use swara names exactly as given (e.g. Ri₁, Ga₃).
Return ONLY a JSON array of strings.`;

export async function generateRecordingReview(
  analysis: RecordingAnalysis,
  context: { unitName?: string | null; studentNote?: string | null },
): Promise<AiReview> {
  const generatedAt = new Date().toISOString();
  const fallback: AiReview = { points: ruleBasedReviewPoints(analysis), source: 'rules', generatedAt };
  if (!process.env.GROQ_API_KEY || analysis.singingSec < 5) return fallback;

  try {
    const msg = JSON.stringify({
      piece: context.unitName ?? null,
      raga: analysis.ragaName,
      studentNote: context.studentNote ?? null,
      measurements: analysis,
    });
    const out = await callGroqSimple(SYSTEM, msg, { temperature: 0.3 });
    const match = out.match(/\[[\s\S]*\]/);
    const parsed = match ? JSON.parse(match[0]) : null;
    const points = Array.isArray(parsed)
      ? parsed.filter((p): p is string => typeof p === 'string' && p.trim().length > 0).map((p) => p.trim().slice(0, 400)).slice(0, 8)
      : [];
    return points.length ? { points, source: 'ai', generatedAt } : fallback;
  } catch (err) {
    console.error('[recording-review] AI review failed, using rule-based points:', err);
    return fallback;
  }
}
