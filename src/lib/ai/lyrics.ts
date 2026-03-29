/**
 * lib/ai/lyrics.ts
 *
 * Groq-powered lyrics assistance: transliteration, translation, summarization.
 * All outputs are DRAFTS — never auto-published. Teacher must review before publishing.
 *
 * Server-only — do NOT import in client components.
 */

import { callGroqSimple } from './groq';

export interface LyricsAiResult {
  action: 'transliterate' | 'translate' | 'summarize';
  output: string;
  disclaimer: string;
  model: string;
}

const DISCLAIMER =
  'This is an AI-generated draft. Please review carefully for accuracy before publishing.';

/**
 * Transliterate Sanskrit/Telugu/Tamil/Kannada lyrics into Roman script.
 * Preserves syllable groupings for musical rendering.
 */
export async function transliterateLyrics(originalText: string): Promise<LyricsAiResult> {
  const systemPrompt = `You are an expert in Carnatic music lyrics and Indian classical singing.
Your task is to transliterate lyrics from their original script (Sanskrit, Telugu, Tamil, Kannada, etc.) into Roman script (ITRANS-style) suitable for a student to follow along while singing.
- Preserve line breaks and verse structure
- Use consistent transliteration conventions (e.g., "sh" for श, "aa" for long a)
- Group syllables clearly for musical rendering
- Do NOT add pronunciation guides or explanations — just the transliteration`;

  const userMessage = `Transliterate these lyrics into Roman script:\n\n${originalText}`;

  const output = await callGroqSimple(systemPrompt, userMessage, { temperature: 0.2 });

  return { action: 'transliterate', output, disclaimer: DISCLAIMER, model: 'llama-3.3-70b-versatile' };
}

/**
 * Translate lyrics into English, preserving poetic meaning.
 */
export async function translateLyrics(originalText: string): Promise<LyricsAiResult> {
  const systemPrompt = `You are an expert in Carnatic music and Indian devotional literature.
Your task is to provide an English translation of the given lyrics that:
- Captures the devotional and poetic meaning
- Identifies the deity or subject being praised
- Translates verse by verse, maintaining the original structure
- Adds brief context for Sanskrit/Tamil/Telugu concepts when helpful`;

  const userMessage = `Translate these Carnatic music lyrics into English:\n\n${originalText}`;

  const output = await callGroqSimple(systemPrompt, userMessage, { temperature: 0.3 });

  return { action: 'translate', output, disclaimer: DISCLAIMER, model: 'llama-3.3-70b-versatile' };
}

/**
 * Summarize/explain the meaning and context of the lyrics.
 */
export async function summarizeLyrics(originalText: string): Promise<LyricsAiResult> {
  const systemPrompt = `You are an expert in Carnatic music, Indian devotional poetry, and Sanskrit/Tamil/Telugu literature.
Provide a concise summary (3-5 sentences) of the given lyrics explaining:
- Which deity or theme the composition addresses
- The key spiritual or devotional message
- Any notable compositional elements (ragam, composer if identifiable)
- Why this piece is significant for students to learn`;

  const userMessage = `Summarize and explain the meaning of these Carnatic lyrics:\n\n${originalText}`;

  const output = await callGroqSimple(systemPrompt, userMessage, { temperature: 0.4 });

  return { action: 'summarize', output, disclaimer: DISCLAIMER, model: 'llama-3.3-70b-versatile' };
}

/**
 * Route action to the appropriate function.
 */
export async function processLyricsAi(
  action: 'transliterate' | 'translate' | 'summarize',
  originalText: string,
): Promise<LyricsAiResult> {
  switch (action) {
    case 'transliterate': return transliterateLyrics(originalText);
    case 'translate': return translateLyrics(originalText);
    case 'summarize': return summarizeLyrics(originalText);
    default: throw new Error(`Unknown action: ${action}`);
  }
}
