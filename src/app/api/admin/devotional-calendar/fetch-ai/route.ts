/**
 * API: POST /api/admin/devotional-calendar/fetch-ai
 *
 * Uses Groq AI to generate devotional calendar events for a given month
 * based on Drik Panchang data. Region-aware (India vs International).
 * Creates events in Firestore automatically.
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { createDoc, queryDocs, nowISO } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';
import { callGroqSimple } from '@/lib/ai/groq';
import { writeAuditLog, extractRequestMeta } from '@/services/audit/log';
import { z } from 'zod';

const FetchSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/), // e.g. "2026-04"
  region: z.enum(['india', 'international']).default('india'),
});

interface AiEvent {
  name: string;
  date: string;
  eventType: string;
  description: string;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['super_admin']);
    const body = await request.json();
    const parsed = FetchSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const { month, region } = parsed.data;
    const [yearStr, monthStr] = month.split('-');
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    const monthName = monthNames[parseInt(monthStr, 10) - 1];
    const year = yearStr;

    const regionContext = region === 'india'
      ? 'Focus on North and South Indian Hindu festivals, ekadashis, and observances as per the Indian calendar. Include regional festivals like Pongal, Onam, Navratri, etc.'
      : 'Include major Hindu festivals and observances that are celebrated internationally by the diaspora community.';

    const systemPrompt = `You are a Hindu devotional calendar assistant. Your task is to provide accurate Hindu festival and observance dates for a specific month and year.

CRITICAL INSTRUCTIONS:
- You MUST search the web for the actual ${monthName} ${year} Hindu calendar dates. Do NOT rely on your training data — panchang dates change every year and training data is inaccurate for future years.
- Search for "${monthName} ${year} Hindu calendar panchang" or "${monthName} ${year} Hindu festivals India drikpanchang" to get verified dates.
- Only include events that fall within ${monthName} ${year}.
- ${regionContext}

Include: major festivals, ekadashis (Shukla & Krishna paksha), pradosh vrats, amavasya, purnima, and important pujas.

Return ONLY a valid JSON array. Each object must have:
- "name": event name in English
- "date": exact date in YYYY-MM-DD format (verified from web search)
- "eventType": one of "festival", "vrat", "ekadashi", "puja", "other"
- "description": 1-2 sentence description of significance

No markdown, no explanation — just the JSON array.`;

    const userMessage = `Search the web and provide all Hindu devotional events for ${monthName} ${year} (region: ${region}). Use live search results, not training data, to get the correct dates.`;

    const aiResponse = await callGroqSimple(systemPrompt, userMessage, {
      temperature: 0.1,
      maxTokens: 4096,
      model: 'compound-beta',
    });

    // Parse AI response
    let events: AiEvent[];
    try {
      const cleaned = aiResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      events = JSON.parse(cleaned);
      if (!Array.isArray(events)) throw new Error('Not an array');
    } catch {
      return Response.json({
        error: 'AI returned invalid format. Please try again.',
        rawResponse: aiResponse.slice(0, 500),
      }, { status: 422 });
    }

    // Check for existing events this month to avoid duplicates
    const existing = await queryDocs(COLLECTIONS.DEVOTIONAL_CALENDAR_EVENTS, [
      { type: 'where', field: 'date', op: '>=', value: `${month}-01` },
      { type: 'where', field: 'date', op: '<=', value: `${month}-31` },
    ]);
    const existingNames = new Set(
      (existing as Array<{ title?: string; name?: string }>).map(e => (e.title || e.name || '').toLowerCase())
    );

    // Create events that don't already exist
    let created = 0;
    let skipped = 0;
    for (const event of events) {
      if (!event.name || !event.date) continue;

      if (existingNames.has(event.name.toLowerCase())) {
        skipped++;
        continue;
      }

      await createDoc(COLLECTIONS.DEVOTIONAL_CALENDAR_EVENTS, {
        title: event.name,
        name: event.name,
        eventDate: event.date,
        date: event.date,
        eventType: event.eventType || 'other',
        description: event.description || '',
        region,
        source: 'ai_generated',
        requiresVerification: true,
        verificationNote: 'AI-generated date — please verify against drikpanchang.com before publishing.',
        attribution: 'Dates are AI-generated drafts. Verify against Drik Panchang (drikpanchang.com).',
        createdBy: auth.uid,
        createdAt: nowISO(),
      });
      created++;
    }

    const { ipAddress, userAgent } = extractRequestMeta(request);
    await writeAuditLog({
      actorId: auth.uid,
      actorRole: auth.role,
      action: 'DEVOTIONAL_CALENDAR_AI_FETCH',
      entityType: 'devotional_calendar_event',
      entityId: month,
      newState: { month, region, created, skipped, totalFromAi: events.length },
      ipAddress,
      userAgent,
    });

    return Response.json({
      success: true,
      created,
      skipped,
      total: events.length,
      warning: 'AI-generated dates may be inaccurate. Hindu festivals follow the lunisolar calendar and dates shift every year. Please verify ALL dates against drikpanchang.com before publishing.',
      attribution: 'Dates are AI-generated drafts. Verify against Drik Panchang (drikpanchang.com).',
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
