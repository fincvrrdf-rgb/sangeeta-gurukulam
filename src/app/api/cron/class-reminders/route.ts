/**
 * API: GET /api/cron/class-reminders
 *
 * Cron job: Send class reminders to students with upcoming classes
 * within the next 60 minutes.
 *
 * Scheduled by Vercel Cron. Authenticated via CRON_SECRET.
 */

import { NextRequest, NextResponse } from 'next/server';
import { queryDocs } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';
import { createNotification } from '@/services/notifications/create';

interface ClassInstance {
  id: string;
  scheduledDate: string;
  scheduledStartTime: string;
  status: string;
  classSlotId: string;
  teacherId: string;
}

interface StudentClassBooking {
  id: string;
  studentId: string;
  classInstanceId: string;
  status: string;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const today = new Date().toISOString().split('T')[0];

    // Find upcoming class instances scheduled for today that are still 'scheduled'
    const classInstances = await queryDocs<ClassInstance>(COLLECTIONS.CLASS_INSTANCES, [
      { type: 'where', field: 'scheduledDate', op: '==', value: today },
      { type: 'where', field: 'status', op: '==', value: 'scheduled' },
    ]);

    // Filter to classes within the next 60 minutes
    const now = new Date();
    const sixtyMinutesFromNow = new Date(now.getTime() + 60 * 60 * 1000);

    const upcomingClasses = classInstances.filter((ci) => {
      const classTime = new Date(`${ci.scheduledDate}T${ci.scheduledStartTime}`);
      return classTime > now && classTime <= sixtyMinutesFromNow;
    });

    let notificationCount = 0;

    for (const classInstance of upcomingClasses) {
      // Find enrolled students for this class instance
      const bookings = await queryDocs<StudentClassBooking>(COLLECTIONS.STUDENT_CLASS_BOOKINGS, [
        { type: 'where', field: 'classInstanceId', op: '==', value: classInstance.id },
        { type: 'where', field: 'status', op: '==', value: 'confirmed' },
      ]);

      // Send reminder notification to each enrolled student
      for (const booking of bookings) {
        await createNotification({
          recipientId: booking.studentId,
          type: 'CLASS_REMINDER',
          title: 'Class Reminder',
          body: `Your class is starting soon at ${classInstance.scheduledStartTime}. Please be ready.`,
          referenceType: 'class_instance',
          referenceId: classInstance.id,
        });
        notificationCount++;
      }
    }

    return NextResponse.json({
      success: true,
      processed: notificationCount,
      classesFound: upcomingClasses.length,
    });
  } catch (error) {
    console.error('[CRON_CLASS_REMINDERS_FAILED]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
