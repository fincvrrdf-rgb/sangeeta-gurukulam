/**
 * API: POST /api/riyaz/pitch-check
 *
 * AI pitch coaching for the raga the student selected. The page sends the
 * raga's swaras (with their ratios to Sa) and what the live tuner measured
 * this session (average cents off per swara), so the feedback is about how
 * the student actually sang, plus any observations they typed.
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { callGroqSimple } from '@/lib/ai/groq';
import { z } from 'zod';

const PitchCheckSchema = z.object({
  pitch: z.string().min(1),           // e.g. "C" "D" "E" "F" etc — the Sa (tonic)
  saHz: z.number().positive().max(2000).optional(),
  swarasAttempted: z.string().min(1), // what they sang, e.g. "S R G M P D N S"
  // The selected raga's swaras with their just-intonation ratios to Sa
  swaras: z
    .array(z.object({ name: z.string().max(10), symbol: z.string().max(10), ratio: z.number().positive().max(4) }))
    .max(12)
    .optional(),
  // What the live tuner measured this session: average signed cents per swara
  measured: z
    .array(z.object({ name: z.string().max(10), avgCents: z.number().min(-1200).max(1200), readings: z.number().int().min(0) }))
    .max(12)
    .optional(),
  observations: z.string().max(500).optional(), // student's own observations
  ragam: z.string().max(60).default('Maya Malava Gowla'),
});

// Interval names for describing each swara's distance from Sa
const INTERVALS = ['unison', 'minor second', 'major second', 'minor third', 'major third', 'perfect fourth',
  'augmented fourth', 'perfect fifth', 'minor sixth', 'major sixth', 'minor seventh', 'major seventh'];

function describeSwara(name: string, ratio: number, saHz?: number): string {
  const cents = 1200 * Math.log2(ratio);
  const semis = Math.round(cents / 100) % 12;
  const hz = saHz ? ` ≈ ${(saHz * ratio).toFixed(1)} Hz` : '';
  return `- ${name}: ${INTERVALS[semis]} above Sa (ratio ${Number(ratio.toFixed(4))}, ${Math.round(cents)}¢${hz})`;
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth(request, ['student', 'teacher', 'super_admin']);
    const body = await request.json();
    const parsed = PitchCheckSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const { pitch, saHz, swarasAttempted, swaras, measured, observations, ragam } = parsed.data;

    const swaraLines = swaras && swaras.length
      ? swaras.map((s) => describeSwara(s.name, s.ratio, saHz)).join('\n')
      : `- ${swarasAttempted}`;

    const measuredLines = measured && measured.length
      ? measured
          .map((m) => {
            const dir = Math.abs(m.avgCents) <= 10 ? 'in tune' : m.avgCents > 0 ? 'sharp (too high)' : 'flat (too low)';
            return `- ${m.name}: average ${m.avgCents > 0 ? '+' : ''}${m.avgCents}¢ — ${dir} (${m.readings} readings)`;
          })
          .join('\n')
      : null;

    const systemPrompt = `You are a Carnatic music teacher specialising in pitch training and voice culture.
The student is practising ragam ${ragam}. Its swaras, tuned in just intonation relative to Sa:
${swaraLines}

The student's Sa is ${pitch}${saHz ? ` (${saHz.toFixed(2)} Hz)` : ''}.
${measuredLines
  ? `The app's live pitch tuner measured the student's singing this session (cents from the correct pitch; 100¢ = one semitone; within ±10¢ is in tune):
${measuredLines}
Base your feedback primarily on these measurements: name the swaras that were sharp or flat, by how much, and how to correct each. Do not invent problems with swaras that measured in tune.`
  : 'No tuner measurements were recorded this session, so give general guidance for this raga.'}

Give a response with:
1. **Sa reference**: the Sa frequency above and what to listen for against the tanpura
2. **Swara-by-swara**: for each swara of this raga, one brief, specific tip${measuredLines ? ' — prioritise the measured problem swaras' : ''}
3. **Today's focus**: one concrete exercise for this practice session
4. **Encouragement**: one sentence

Use only the swaras listed for this raga; never describe swaras from a different raga. Keep it concise and practical, with clear sections. Do NOT use markdown tables.`;

    const userMessage = observations
      ? `I practised the swaras: ${swarasAttempted}. My own observations: ${observations}. Please give me feedback.`
      : `I practised the swaras: ${swarasAttempted}. Please give me pitch feedback.`;

    const feedback = await callGroqSimple(systemPrompt, userMessage, {
      temperature: 0.4,
      maxTokens: 1024,
    });

    return Response.json({ success: true, feedback, ragam, pitch });
  } catch (error) {
    return authErrorResponse(error);
  }
}
