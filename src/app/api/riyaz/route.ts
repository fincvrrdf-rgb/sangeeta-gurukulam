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
  duration: z.number().int().min(1).max(480).optional(),
  durationMinutes: z.number().int().min(1).max(480).optional(),
  notes: z.string().max(500).optional(),
}).refine((d) => d.duration || d.durationMinutes, {
  message: 'duration or durationMinutes is required',
});

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['student', 'teacher', 'super_admin']);

    const studentId = auth.role === 'student' ? auth.uid
      : request.nextUrl.searchParams.get('studentId') ?? auth.uid;

    const records = await queryDocs<Record<string, unknown>>(COLLECTIONS.RIYAZ_CHECKINS, [
      { type: 'where', field: 'studentId', op: '==', value: studentId },
    ]);

    // Sort client-side to avoid composite index requirement
    records.sort((a, b) =>
      String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''))
    );

    // Filter to last 30 days client-side
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const recent = records.filter((r) => String(r.createdAt ?? '') >= thirtyDaysAgo);

    // Compute stats
    const dates = new Set(recent.map((r) => String(r.date ?? String(r.createdAt ?? '').slice(0, 10))));
    const sortedDates = Array.from(dates).sort().reverse();
    let currentStreak = 0;
    const today = new Date();
    for (let i = 0; i < sortedDates.length; i++) {
      const expected = new Date(today);
      expected.setDate(today.getDate() - i);
      const expectedStr = expected.toISOString().slice(0, 10);
      if (sortedDates.includes(expectedStr)) {
        currentStreak++;
      } else {
        break;
      }
    }

    const totalMinutes = recent.reduce((sum, r) => sum + (Number(r.durationMinutes) || 0), 0);

    return NextResponse.json({
      checkins: recent,
      stats: {
        currentStreak,
        longestStreak: currentStreak, // simplified
        totalSessions: recent.length,
        totalMinutes,
      },
    });
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
    const mins = parsed.data.duration ?? parsed.data.durationMinutes ?? 0;

    const checkinId = await createDoc(COLLECTIONS.RIYAZ_CHECKINS, {
      studentId: auth.uid,
      date: today,
      durationMinutes: mins,
      notes: parsed.data.notes ?? null,
      createdAt: now,
    });

    return NextResponse.json({ id: checkinId, date: today }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
