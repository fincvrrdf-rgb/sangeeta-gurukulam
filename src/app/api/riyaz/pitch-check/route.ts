/**
 * API: POST /api/riyaz/pitch-check
 *
 * AI-based pitch accuracy feedback for SRGMPDN swaras in Maya Malava Gowla Ragam.
 * Student describes what they sang/noticed; AI gives targeted feedback and tips.
 *
 * In future: accept audio file and do actual pitch analysis via Gemini.
 * For now: text-based AI coaching with pitch guidance.
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { callGroqSimple } from '@/lib/ai/groq';
import { z } from 'zod';

const PitchCheckSchema = z.object({
  pitch: z.string().min(1),         // e.g. "C" "D" "E" "F" etc — the Sa (tonic)
  swarasAttempted: z.string().min(1), // what they sang, e.g. "S R G M P D N S"
  observations: z.string().optional(), // student's own observations
  ragam: z.string().default('Maya Malava Gowla'),
});

export async function POST(request: NextRequest) {
  try {
    await requireAuth(request, ['student', 'teacher', 'super_admin']);
    const body = await request.json();
    const parsed = PitchCheckSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const { pitch, swarasAttempted, observations, ragam } = parsed.data;

    const systemPrompt = `You are a Carnatic music teacher specialising in pitch training and voice culture.
The student is practicing the ${ragam} ragam, which has the swaras:
- Sa (Shadja) — the tonic
- Ri2 (Chatushruti Rishabha) — the note a major second above Sa
- Ga3 (Antara Gandhara) — a major third above Sa
- Ma1 (Shuddha Madhyama) — a perfect fourth above Sa
- Pa (Panchama) — a perfect fifth above Sa
- Dha1 (Shuddha Dhaivata) — a major sixth above Sa
- Ni3 (Kakali Nishada) — a major seventh above Sa
- SA (upper octave Sa)

The student is singing with Sa fixed at pitch: ${pitch}

Give a response with:
1. **Sa Pitch Reference**: The exact frequency (Hz) for their Sa note (${pitch}) and what to listen for
2. **Swara-by-swara tips**: For each swara S R G M P D N, give 1 brief tip on common errors and how to correct
3. **Today's Focus**: One specific thing to focus on for this practice session
4. **Encouragement**: One sentence of motivation

Keep response concise and practical. Format with clear sections. Do NOT use markdown tables.`;

    const userMessage = observations
      ? `I practiced the swaras: ${swarasAttempted}. My observations: ${observations}. Please give me feedback.`
      : `I practiced the swaras: ${swarasAttempted}. Please give me pitch guidance.`;

    const feedback = await callGroqSimple(systemPrompt, userMessage, {
      temperature: 0.4,
      maxTokens: 1024,
    });

    return Response.json({ success: true, feedback, ragam, pitch });
  } catch (error) {
    return authErrorResponse(error);
  }
}
