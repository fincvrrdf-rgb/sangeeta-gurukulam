/**
 * API: GET/POST /api/bhajan
 *
 * GET  — Get today's bhajan session or list recent sessions.
 * POST — Teacher creates/starts a new bhajan session.
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { createDoc, queryDocs, nowISO } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';
import { writeAuditLog, extractRequestMeta } from '@/services/audit/log';
import type { BhajanSession } from '@/domain/types';
import { z } from 'zod';

const CreateBhajanSchema = z.object({
  date: z.string().min(1),
  youtubeLink: z.string().min(1).optional(),
  status: z.enum(['scheduled', 'live', 'ended']).default('scheduled'),
});

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request, []);

    const { searchParams } = new URL(request.url);
    const today = new Date().toISOString().slice(0, 10);
    const date = searchParams.get('date') || today;
    const limit = Math.min(Number(searchParams.get('limit') || '10'), 50);

    // Try today first
    let sessions = await queryDocs<BhajanSession>(COLLECTIONS.BHAJAN_SESSIONS, [
      { type: 'where', field: 'sessionDate', op: '==', value: date },
      { type: 'orderBy', field: 'createdAt', direction: 'desc' },
      { type: 'limit', value: limit },
    ]);

    // If no session exists for today, auto-create one — bhajan runs every day
    if (sessions.length === 0 && date === today) {
      await createDoc(COLLECTIONS.BHAJAN_SESSIONS, {
        sessionDate: today,
        title: '',
        announcement: '',
        youtubeUrl: null,
        youtubeLink: null,
        youtubeReplayUrl: null,
        status: 'scheduled',
        scheduledTime: '17:30',
        timezone: 'Asia/Kolkata',
        cancellationReason: null,
        lyricsIds: [],
        devotionalContext: '',
        notes: '',
        managedBy: 'system',
        createdAt: nowISO(),
        updatedAt: nowISO(),
      });
      sessions = await queryDocs<BhajanSession>(COLLECTIONS.BHAJAN_SESSIONS, [
        { type: 'where', field: 'sessionDate', op: '==', value: today },
        { type: 'orderBy', field: 'createdAt', direction: 'desc' },
        { type: 'limit', value: 1 },
      ]);
    }

    return Response.json({ sessions });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['teacher', 'super_admin']);
    const body = await request.json();
    const parsed = CreateBhajanSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const { date, youtubeLink, status } = parsed.data;

    const sessionId = await createDoc(COLLECTIONS.BHAJAN_SESSIONS, {
      sessionDate: date,
      title: '',
      announcement: '',
      youtubeUrl: youtubeLink ?? null,
      youtubeReplayUrl: null,
      status,
      cancellationReason: null,
      lyricsIds: [],
      devotionalContext: '',
      notes: '',
      managedBy: auth.uid,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    });

    const { ipAddress, userAgent } = extractRequestMeta(request);
    await writeAuditLog({
      actorId: auth.uid,
      actorRole: auth.role,
      action: 'BHAJAN_SESSION_CREATED',
      entityType: 'bhajan_session',
      entityId: sessionId,
      newState: { date, status },
      ipAddress,
      userAgent,
    });

    return Response.json({ success: true, sessionId }, { status: 201 });
  } catch (error) {
    return authErrorResponse(error);
  }
}
