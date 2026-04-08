/**
 * API: POST /api/admin/devotional-calendar/seed-2026
 *
 * Clears all 2026 devotional calendar events and repopulates them
 * by calling Groq compound-beta (web search) for each month of 2026.
 * Super admin only. This is a one-time operation — takes ~30–60 seconds.
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { queryDocs, deleteDoc, createDoc, nowISO } from '@/lib/firebase/firestore';
import { writeAuditLog, extractRequestMeta } from '@/services/audit/log';
import { COLLECTIONS } from '@/domain/constants';
import { callGroqSimple } from '@/lib/ai/groq';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface AiEvent {
  name: string;
  date: string;
  eventType: string;
  description: string;
}

async function fetchEventsForMonth(monthNum: number): Promise<AiEvent[]> {
  const monthName = MONTH_NAMES[monthNum - 1];
  const monthStr = String(monthNum).padStart(2, '0');

  const systemPrompt = `You are a Hindu devotional calendar assistant providing accurate 2026 Hindu festival dates for India.

CRITICAL: You MUST use web search to find the actual ${monthName} 2026 Hindu panchang dates. Do NOT use training data — festival dates shift every year based on the lunisolar calendar.

Search for: "${monthName} 2026 Hindu festival calendar drikpanchang India"

Return ONLY a JSON array of events in ${monthName} 2026. Each object must have:
- "name": festival/event name in English
- "date": exact date as "2026-${monthStr}-DD" (must be a real date in ${monthName} 2026)
- "eventType": one of "festival", "vrat", "ekadashi", "puja", "other"
- "description": 1 sentence of significance

Include: major festivals, ekadashis (Shukla + Krishna paksha), pradosh vrats, amavasya, purnima, important pujas.
No markdown, no explanation — ONLY the JSON array.`;

  const userMessage = `Search the web and give me all Hindu devotional events for ${monthName} 2026 (India). Use live search results only.`;

  const response = await callGroqSimple(systemPrompt, userMessage, {
    temperature: 0.1,
    maxTokens: 2048,
    model: 'compound-beta',
  });

  const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  // Find the JSON array in the response
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start === -1 || end === -1) return [];

  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  if (!Array.isArray(parsed)) return [];
  return parsed;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['super_admin']);

    // Step 1: Clear all existing 2026 events
    const existing = await queryDocs<{ id: string }>(COLLECTIONS.DEVOTIONAL_CALENDAR_EVENTS, [
      { type: 'where', field: 'date', op: '>=', value: '2026-01-01' },
      { type: 'where', field: 'date', op: '<=', value: '2026-12-31' },
    ]);

    let cleared = 0;
    for (const ev of existing) {
      await deleteDoc(COLLECTIONS.DEVOTIONAL_CALENDAR_EVENTS, ev.id);
      cleared++;
    }

    // Step 2: Fetch from Groq (web search) for each of the 12 months
    let created = 0;
    const errors: string[] = [];

    for (let m = 1; m <= 12; m++) {
      try {
        const events = await fetchEventsForMonth(m);
        const monthPrefix = `2026-${String(m).padStart(2, '0')}`;

        for (const ev of events) {
          if (!ev.name || !ev.date) continue;
          // Validate date belongs to this month
          if (!ev.date.startsWith(monthPrefix)) continue;

          await createDoc(COLLECTIONS.DEVOTIONAL_CALENDAR_EVENTS, {
            title: ev.name,
            name: ev.name,
            eventDate: ev.date,
            date: ev.date,
            eventType: ev.eventType || 'other',
            description: ev.description || '',
            region: 'india',
            source: 'ai_web_search_2026',
            requiresVerification: false,
            createdBy: auth.uid,
            createdAt: nowISO(),
          });
          created++;
        }
      } catch (err) {
        errors.push(`${MONTH_NAMES[m - 1]}: ${err instanceof Error ? err.message : 'failed'}`);
      }
    }

    const { ipAddress, userAgent } = extractRequestMeta(request);
    await writeAuditLog({
      actorId: auth.uid,
      actorRole: auth.role,
      action: 'DEVOTIONAL_CALENDAR_CLEARED',
      entityType: 'devotional_calendar_event',
      entityId: '2026',
      newState: { year: 2026, cleared, created, errors },
      ipAddress,
      userAgent,
    });

    return Response.json({
      success: true,
      cleared,
      created,
      errors: errors.length ? errors : undefined,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
