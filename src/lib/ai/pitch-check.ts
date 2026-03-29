/**
 * lib/ai/pitch-check.ts
 *
 * Groq-based placeholder for pitch analysis.
 * Since Llama doesn't process audio directly, this generates structured feedback
 * based on a teacher's scoring, or can be extended with audio-to-text first.
 *
 * Server-only — do NOT import in client components.
 */

import { callGroqSimple } from './groq';

export interface PitchCheckResult {
  overallScore: number; // 0-100
  pitchAccuracy: 'excellent' | 'good' | 'needs_work' | 'poor';
  specificFeedback: string[];
  recommendations: string[];
  disclaimer: string;
}

const DISCLAIMER =
  'AI pitch feedback is a draft. Teacher review is required before sharing with student.';

/**
 * Generate AI pitch check feedback based on teacher rubric scores.
 * In future this can be extended to process actual audio waveforms.
 */
export async function generatePitchFeedback(input: {
  teachingUnitName: string;
  ragam: string | null;
  taalam: string | null;
  teacherScores: Record<string, number>; // dimension key → score (0-10)
  teacherNotes?: string;
}): Promise<PitchCheckResult> {
  const { teachingUnitName, ragam, taalam, teacherScores, teacherNotes } = input;

  const scoresText = Object.entries(teacherScores)
    .map(([key, score]) => `${key}: ${score}/10`)
    .join('\n');

  const systemPrompt = `You are a Carnatic music teacher reviewing a student's practice recording.
Based on the scoring rubric below, generate specific, actionable feedback for the student.
Be encouraging but honest. Keep feedback concise — 2-3 bullet points per section.
Return ONLY valid JSON in this exact structure:
{
  "specificFeedback": ["feedback point 1", "feedback point 2", "feedback point 3"],
  "recommendations": ["recommendation 1", "recommendation 2"]
}`;

  const userMessage = `Teaching Unit: ${teachingUnitName}
Ragam: ${ragam || 'Not specified'}
Taalam: ${taalam || 'Not specified'}

Teacher Scores:
${scoresText}

Teacher Notes: ${teacherNotes || 'None'}

Generate student feedback based on these scores.`;

  const raw = await callGroqSimple(systemPrompt, userMessage, { temperature: 0.4 });

  let parsed: { specificFeedback: string[]; recommendations: string[] };
  try {
    // Extract JSON from response
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { specificFeedback: [], recommendations: [] };
  } catch {
    parsed = {
      specificFeedback: ['Practice recording reviewed. See teacher for detailed feedback.'],
      recommendations: ['Continue regular practice and focus on shruti accuracy.'],
    };
  }

  // Calculate overall score from teacher scores
  const scores = Object.values(teacherScores);
  const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 5;
  const overallScore = Math.round(avgScore * 10); // 0-100

  const pitchAccuracy: PitchCheckResult['pitchAccuracy'] =
    avgScore >= 8 ? 'excellent' : avgScore >= 6 ? 'good' : avgScore >= 4 ? 'needs_work' : 'poor';

  return {
    overallScore,
    pitchAccuracy,
    specificFeedback: parsed.specificFeedback || [],
    recommendations: parsed.recommendations || [],
    disclaimer: DISCLAIMER,
  };
}
