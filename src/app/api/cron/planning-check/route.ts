/**
 * API: GET /api/cron/planning-check
 *
 * Cron job: Check if teachers have submitted their lesson plans
 * for the upcoming month. If not, sends a reminder notification
 * to the teacher.
 *
 * Scheduled by Vercel Cron. Authenticated via CRON_SECRET.
 */

import { NextRequest, NextResponse } from 'next/server';
import { queryDocs } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';
import { createNotification } from '@/services/notifications/create';

interface LessonPlan {
  id: string;
  teacherId: string;
  monthOf: string;
  status: string;
}

interface TeacherProfile {
  id: string;
  userId: string;
  fullName: string;
  isActive: boolean;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Determine the upcoming month (next month from today)
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const upcomingMonth = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}`;

    // Get all active teachers
    const teachers = await queryDocs<TeacherProfile>(COLLECTIONS.TEACHER_PROFILES, [
      { type: 'where', field: 'isActive', op: '==', value: true },
    ]);

    // Get all lesson plans for the upcoming month
    const lessonPlans = await queryDocs<LessonPlan>(COLLECTIONS.LESSON_PLANS, [
      { type: 'where', field: 'monthOf', op: '==', value: upcomingMonth },
    ]);

    const teachersWithPlans = new Set(lessonPlans.map((lp) => lp.teacherId));

    let notificationCount = 0;

    for (const teacher of teachers) {
      if (!teachersWithPlans.has(teacher.id)) {
        await createNotification({
          recipientId: teacher.userId,
          type: 'LESSON_PLAN_REMINDER',
          title: 'Lesson Plan Reminder',
          body: `Your lesson plan for ${upcomingMonth} has not been submitted yet. Please prepare and submit it before the month begins.`,
          referenceType: 'lesson_plan',
          referenceId: teacher.id,
        });
        notificationCount++;
      }
    }

    return NextResponse.json({
      success: true,
      processed: notificationCount,
      totalTeachers: teachers.length,
      teachersWithPlans: teachersWithPlans.size,
    });
  } catch (error) {
    console.error('[CRON_PLANNING_CHECK_FAILED]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
