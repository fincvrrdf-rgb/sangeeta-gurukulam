/**
 * API: POST /api/classes/[instanceId]/create-meet
 *
 * Creates a Google Calendar event with a Google Meet link for a class instance.
 * Requires the teacher to have connected their Google Calendar (OAuth).
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse, AuthError } from '@/lib/auth/middleware';
import { getDoc, updateDoc } from '@/lib/firebase/firestore';
import { writeAuditLog, extractRequestMeta } from '@/services/audit/log';
import { COLLECTIONS } from '@/domain/constants';
import { createCalendarEventWithMeet, refreshAccessToken } from '@/lib/calendar/google';
import type { ClassInstance, TeacherProfile } from '@/domain/types';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ instanceId: string }> }
) {
  try {
    const auth = await requireAuth(request, ['teacher', 'super_admin']);
    const { instanceId } = await params;

    // Load class instance
    const instance = await getDoc<ClassInstance>(COLLECTIONS.CLASS_INSTANCES, instanceId);
    if (!instance) {
      return Response.json({ error: 'Class instance not found' }, { status: 404 });
    }

    // Already has a meet link
    if (instance.googleMeetLink) {
      return Response.json({ success: true, meetLink: instance.googleMeetLink, alreadyExists: true });
    }

    // Load teacher profile to get OAuth token ref
    const teacherProfile = await getDoc<TeacherProfile>(COLLECTIONS.TEACHER_PROFILES, instance.teacherId);
    if (!teacherProfile) {
      return Response.json({ error: 'Teacher profile not found' }, { status: 404 });
    }

    if (!teacherProfile.googleCalendarConnected || !teacherProfile.googleOAuthTokenRef) {
      return Response.json(
        { error: 'Teacher has not connected Google Calendar. Please complete OAuth setup first.' },
        { status: 400 }
      );
    }

    // Retrieve the refresh token and get a fresh access token
    const accessToken = await refreshAccessToken(teacherProfile.googleOAuthTokenRef);

    // Create calendar event with Meet link
    const result = await createCalendarEventWithMeet(accessToken, {
      summary: `Sangeeta Gurukulam — Class`,
      description: `Class instance ${instanceId}`,
      startTimeISO: instance.scheduledStartTime,
      endTimeISO: instance.scheduledEndTime,
      timezone: instance.timezone,
      idempotencyKey: instanceId,
    });

    // Save meet link and calendar event ID back to the instance
    await updateDoc(COLLECTIONS.CLASS_INSTANCES, instanceId, {
      googleMeetLink: result.meetLink,
      googleCalendarEventId: result.eventId,
    });

    const { ipAddress, userAgent } = extractRequestMeta(request);
    await writeAuditLog({
      actorId: auth.uid,
      actorRole: auth.role,
      action: 'MEET_LINK_CREATED',
      entityType: 'class_instance',
      entityId: instanceId,
      newState: { meetLink: result.meetLink, googleCalendarEventId: result.eventId },
      ipAddress,
      userAgent,
    });

    return Response.json({ success: true, meetLink: result.meetLink, eventId: result.eventId });
  } catch (error) {
    return authErrorResponse(error);
  }
}
