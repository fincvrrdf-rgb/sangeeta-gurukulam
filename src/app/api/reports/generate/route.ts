/**
 * API: POST /api/reports/generate
 *
 * Generate AI-assisted weekly reports for ALL students (or a specific one).
 * Accepts { weekStartDate: 'YYYY-MM-DD', studentId?: string }
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { queryDocs } from '@/lib/firebase/firestore';
import { generateWeeklyReport } from '@/services/reports/generate';
import { COLLECTIONS } from '@/domain/constants';
import { z } from 'zod';

const GenerateSchema = z.object({
  weekStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format'),
  studentId: z.string().optional(),
});

/** Convert YYYY-MM-DD to ISO week string YYYY-WW */
function dateToWeekOf(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  // ISO week: Thursday of the week determines the year
  const thu = new Date(d);
  thu.setUTCDate(d.getUTCDate() + 3 - (d.getUTCDay() + 6) % 7);
  const week1 = new Date(Date.UTC(thu.getUTCFullYear(), 0, 4));
  const weekNum = 1 + Math.round(
    ((thu.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getUTCDay() + 6) % 7) / 7
  );
  return `${thu.getUTCFullYear()}-${String(weekNum).padStart(2, '0')}`;
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`;

    let teacherId: string;
    if (isCron) {
      teacherId = 'system';
    } else {
      const auth = await requireAuth(request, ['teacher', 'super_admin']);
      teacherId = auth.uid;
    }

    const body = await request.json();
    const parsed = GenerateSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const { weekStartDate, studentId } = parsed.data;
    const weekOf = dateToWeekOf(weekStartDate);

    if (studentId) {
      // Generate for one student
      const reportId = await generateWeeklyReport({ studentId, teacherId, weekOf });
      return Response.json({ success: true, reportId, weekOf }, { status: 201 });
    }

    // Generate for all students
    const students = await queryDocs<Record<string, unknown>>(COLLECTIONS.STUDENT_PROFILES, []);
    const reportIds: string[] = [];
    const errors: string[] = [];

    for (const s of students) {
      try {
        const id = await generateWeeklyReport({
          studentId: s.userId as string,
          teacherId,
          weekOf,
        });
        reportIds.push(id);
      } catch (e) {
        errors.push(`${s.userId}: ${e instanceof Error ? e.message : 'error'}`);
      }
    }

    return Response.json({
      success: true,
      generated: reportIds.length,
      errors: errors.length > 0 ? errors : undefined,
      weekOf,
    }, { status: 201 });
  } catch (error) {
    return authErrorResponse(error);
  }
}
