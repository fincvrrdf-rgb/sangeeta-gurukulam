/**
 * API: POST /api/planning/ai-generate
 *
 * Generate an AI-assisted monthly lesson plan.
 * Teacher provides batch, unit name, and focus areas.
 * Returns 4-week plan suggestions.
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { callGroqSimple } from '@/lib/ai/groq';
import { z } from 'zod';

const AIPlanSchema = z.object({
  batchCode: z.enum(['A', 'B', 'C', 'D']),
  unitName: z.string().min(1),
  focusAreas: z.string().optional().default(''),
  month: z.string().regex(/^\d{4}-\d{2}$/),
});

export async function POST(request: NextRequest) {
  try {
    await requireAuth(request, ['teacher', 'super_admin']);
    const body = await request.json();
    const parsed = AIPlanSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const { batchCode, unitName, focusAreas, month } = parsed.data;
    const [year, mo] = month.split('-');
    const monthName = new Date(Number(year), Number(mo) - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' });

    const systemPrompt = `You are an expert Carnatic vocal music teacher's planning assistant for Sangeeta Gurukulam.
Generate a practical, week-by-week lesson plan. Keep language clear and actionable.
Return ONLY a valid JSON array with exactly 4 items (one per week):
[
  {
    "weekNumber": 1,
    "objectives": "Specific learning objectives for this week",
    "activities": "Specific practice activities and exercises",
    "notes": "Teacher tips or student reminders"
  },
  ...
]`;

    const userMessage = `Month: ${monthName}
Batch: ${batchCode} — ${batchCode === 'A' ? 'Beginner (Swaravali/Jantai)' : batchCode === 'B' ? 'Developing (Dhattu/Alankarams)' : batchCode === 'C' ? 'Geetham Beginner' : 'Geetham Advanced'}
Current Unit: ${unitName}
Focus areas: ${focusAreas || 'General practice and refinement'}

Generate a 4-week lesson plan for this month.`;

    const aiOutput = await callGroqSimple(systemPrompt, userMessage, { temperature: 0.4, maxTokens: 2000 });

    let suggestions: unknown[];
    try {
      // Extract JSON from response
      const jsonMatch = aiOutput.match(/\[[\s\S]*\]/);
      suggestions = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    } catch {
      suggestions = [];
    }

    return Response.json({ success: true, suggestions, rawOutput: aiOutput });
  } catch (error) {
    return authErrorResponse(error);
  }
}
