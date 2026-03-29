/**
 * API: GET /api/cron/bhajan-status
 *
 * Cron job: Auto-create a daily bhajan session for today if one
 * doesn't already exist. Sets status to 'scheduled' with the
 * default time from app settings.
 *
 * Scheduled by Vercel Cron. Authenticated via CRON_SECRET.
 */

import { NextRequest, NextResponse } from 'next/server';
import { queryDocs, getDoc, createDoc, nowISO } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';
import type { AppSettings } from '@/domain/types';

interface BhajanSession {
  id: string;
  sessionDate: string;
  status: string;
  scheduledTime: string;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const today = new Date().toISOString().split('T')[0];

    // Check if a bhajan session already exists for today
    const existingSessions = await queryDocs<BhajanSession>(COLLECTIONS.BHAJAN_SESSIONS, [
      { type: 'where', field: 'sessionDate', op: '==', value: today },
    ]);

    if (existingSessions.length > 0) {
      return NextResponse.json({
        success: true,
        processed: 0,
        message: 'Bhajan session already exists for today',
      });
    }

    // Get default bhajan time from app settings
    const settings = await getDoc<AppSettings>(COLLECTIONS.APP_SETTINGS, 'global');
    const defaultTime = settings?.bhajan?.defaultTime ?? '17:30';
    const timezone = settings?.bhajan?.timezone ?? 'Asia/Kolkata';

    // Create today's bhajan session
    const sessionId = await createDoc(COLLECTIONS.BHAJAN_SESSIONS, {
      sessionDate: today,
      scheduledTime: defaultTime,
      timezone,
      status: 'scheduled',
      attendees: [],
      lyricsIds: [],
      notes: '',
      createdBy: 'system',
    });

    return NextResponse.json({
      success: true,
      processed: 1,
      sessionId,
    });
  } catch (error) {
    console.error('[CRON_BHAJAN_STATUS_FAILED]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
