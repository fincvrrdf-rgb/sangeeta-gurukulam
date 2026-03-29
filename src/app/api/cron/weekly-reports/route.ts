/**
 * API: GET /api/cron/weekly-reports
 *
 * Cron job: Auto-generate weekly reports for all active students.
 * Called on Fridays at 6 PM.
 *
 * Scheduled by Vercel Cron. Authenticated via CRON_SECRET.
 */

import { NextRequest, NextResponse } from 'next/server';
import { queryDocs } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';
import { generateWeeklyReport } from '@/services/reports/generate';

interface StudentProfile {
  id: string;
  fullName: string;
  isActive: boolean;
  assignedTeacherId: string;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get all active students
    const students = await queryDocs<StudentProfile>(COLLECTIONS.STUDENT_PROFILES, [
      { type: 'where', field: 'isActive', op: '==', value: true },
    ]);

    // Calculate current week identifier (YYYY-WW)
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const daysSinceStart = Math.floor((now.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
    const weekNumber = Math.ceil((daysSinceStart + startOfYear.getDay() + 1) / 7);
    const weekOf = `${now.getFullYear()}-${String(weekNumber).padStart(2, '0')}`;

    let successCount = 0;
    let failCount = 0;
    const errors: Array<{ studentId: string; error: string }> = [];

    for (const student of students) {
      try {
        await generateWeeklyReport({
          studentId: student.id,
          teacherId: student.assignedTeacherId,
          weekOf,
        });
        successCount++;
      } catch (error) {
        failCount++;
        errors.push({
          studentId: student.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        console.error(`[CRON_WEEKLY_REPORT_FAILED] Student: ${student.id}`, error);
      }
    }

    return NextResponse.json({
      success: true,
      processed: successCount,
      failed: failCount,
      totalStudents: students.length,
      weekOf,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('[CRON_WEEKLY_REPORTS_FAILED]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
