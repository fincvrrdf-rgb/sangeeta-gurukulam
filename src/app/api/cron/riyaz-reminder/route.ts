/**
 * API: GET /api/cron/riyaz-reminder
 *
 * Cron job: Send daily riyaz (practice) reminder to all active students.
 *
 * Scheduled by Vercel Cron. Authenticated via CRON_SECRET.
 */

import { NextRequest, NextResponse } from 'next/server';
import { queryDocs } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';
import { createNotification } from '@/services/notifications/create';

interface StudentProfile {
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
    // Get all active students
    const students = await queryDocs<StudentProfile>(COLLECTIONS.STUDENT_PROFILES, [
      { type: 'where', field: 'isActive', op: '==', value: true },
    ]);

    let notificationCount = 0;

    for (const student of students) {
      await createNotification({
        recipientId: student.userId,
        type: 'RIYAZ_REMINDER',
        title: 'Daily Riyaz Reminder',
        body: 'Time for your daily riyaz (practice)! Consistent practice is the key to progress in Carnatic music. Open the app to log your practice session.',
        referenceType: 'riyaz_checkin',
        referenceId: student.id,
      });
      notificationCount++;
    }

    return NextResponse.json({
      success: true,
      processed: notificationCount,
    });
  } catch (error) {
    console.error('[CRON_RIYAZ_REMINDER_FAILED]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
