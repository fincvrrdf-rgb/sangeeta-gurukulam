/**
 * POST /api/riyaz — Log a riyaz (practice) check-in
 * GET  /api/riyaz — Get student's own riyaz check-in history
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, AuthError, authErrorResponse } from '@/lib/auth/middleware';
import { createDoc, queryDocs, nowISO } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';

const CheckInSchema = z.object({
  durationMinutes: z.number().int().min(1).max(480),
  notes: z.string().max(500).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['student', 'teacher', 'super_admin']);

    const studentId = auth.role === 'student' ? auth.uid
      : request.nextUrl.searchParams.get('studentId') ?? auth.uid;

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const records = await queryDocs<Record<string, unknown>>(COLLECTIONS.RIYAZ_CHECKINS, [
      { type: 'where', field: 'studentId', op: '==', value: studentId },
      { type: 'where', field: 'createdAt', op: '>=', value: thirtyDaysAgo },
    ]);
    // Sort client-side to avoid requiring a composite Firestore index
    records.sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));

    return NextResponse.json({ checkins: records });
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['student']);

    const body = await request.json();
    const parsed = CheckInSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
    }

    const now = nowISO();
    const today = now.slice(0, 10); // YYYY-MM-DD

    const checkinId = await createDoc(COLLECTIONS.RIYAZ_CHECKINS, {
      studentId: auth.uid,
      date: today,
      durationMinutes: parsed.data.durationMinutes,
      notes: parsed.data.notes ?? null,
      createdAt: now,
    });

    return NextResponse.json({ id: checkinId, date: today }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
