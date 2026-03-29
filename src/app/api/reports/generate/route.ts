/**
 * API: POST /api/reports/generate
 *
 * Generate an AI-assisted weekly report for a student.
 * Can be triggered manually by teacher/admin or via cron (Authorization: Bearer CRON_SECRET).
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { generateWeeklyReport } from '@/services/reports/generate';
import { z } from 'zod';

const GenerateSchema = z.object({
  studentId: z.string().min(1),
  weekStartDate: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    // Check for cron secret in Authorization header first
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    const isCron =
      cronSecret && authHeader === `Bearer ${cronSecret}`;

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

    const { studentId, weekStartDate } = parsed.data;

    const reportId = await generateWeeklyReport({
      studentId,
      teacherId,
      weekOf: weekStartDate,
    });

    return Response.json({ success: true, reportId }, { status: 201 });
  } catch (error) {
    return authErrorResponse(error);
  }
}
