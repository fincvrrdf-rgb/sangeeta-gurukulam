/**
 * API: POST /api/lyrics/[id]/ai
 *
 * Generate AI-assisted transliteration, translation, or summary for lyrics.
 * Saves the result as an AI lyrics draft with status 'pending_review'.
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { getDoc, createDoc, nowISO } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';
import { callGroqSimple } from '@/lib/ai/groq';
import { writeAuditLog, extractRequestMeta } from '@/services/audit/log';
import type { Lyrics } from '@/domain/types';
import { z } from 'zod';

const AiLyricsSchema = z.object({
  action: z.enum(['transliterate', 'translate', 'summarize']),
});

const SYSTEM_PROMPTS: Record<string, string> = {
  transliterate:
    'You are an expert in Indian classical music and Sanskrit/Tamil transliteration. ' +
    'Transliterate the following lyrics from their original script into accurate Latin (Roman) script. ' +
    'Preserve syllable boundaries and diacritical conventions commonly used in Carnatic music notation.',
  translate:
    'You are an expert in Indian classical music, Sanskrit, and Tamil. ' +
    'Translate the following lyrics into clear, natural English. ' +
    'Preserve poetic structure and devotional meaning.',
  summarize:
    'You are an expert in Indian classical music and devotional literature. ' +
    'Provide a concise summary of the following lyrics, including the deity addressed, ' +
    'the devotional theme, and any notable literary or musical features.',
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request, ['teacher', 'super_admin']);
    const { id } = await params;
    const body = await request.json();
    const parsed = AiLyricsSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const { action } = parsed.data;

    const lyrics = await getDoc<Lyrics>(COLLECTIONS.LYRICS, id);
    if (!lyrics) {
      return Response.json({ error: 'Lyrics not found' }, { status: 404 });
    }

    const inputText = action === 'transliterate'
      ? lyrics.sourceText
      : action === 'translate'
        ? lyrics.sourceText || lyrics.transliteration
        : `${lyrics.title}\n\n${lyrics.sourceText}`;

    if (!inputText) {
      return Response.json({ error: 'No source text available for this operation' }, { status: 400 });
    }

    const aiOutput = await callGroqSimple(
      SYSTEM_PROMPTS[action],
      inputText,
      { temperature: 0.3, maxTokens: 4096 }
    );

    const draftTypeMap: Record<string, string> = {
      transliterate: 'transliteration',
      translate: 'translation',
      summarize: 'summary',
    };

    const draftId = await createDoc(COLLECTIONS.AI_LYRICS_DRAFTS, {
      lyricsId: id,
      draftType: draftTypeMap[action],
      inputQuery: inputText.slice(0, 500),
      targetLanguage: action === 'translate' ? 'en' : null,
      rawAiOutput: aiOutput,
      status: 'pending_review',
      reviewedBy: null,
      reviewedAt: null,
    });

    const { ipAddress, userAgent } = extractRequestMeta(request);
    await writeAuditLog({
      actorId: auth.uid,
      actorRole: auth.role,
      action: 'AI_LYRICS_DRAFT_CREATED',
      entityType: 'ai_lyrics_draft',
      entityId: draftId,
      newState: { lyricsId: id, action, draftType: draftTypeMap[action] },
      ipAddress,
      userAgent,
    });

    return Response.json({ success: true, draftId, aiOutput }, { status: 201 });
  } catch (error) {
    return authErrorResponse(error);
  }
}
