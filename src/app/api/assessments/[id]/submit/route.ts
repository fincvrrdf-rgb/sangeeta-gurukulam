/**
 * API: POST /api/assessments/[id]/submit
 *
 * A student attaches their performance VIDEO to an assessment the teacher set.
 * Video only — the taalam (hand gestures) has to be visible for grading.
 *
 * The browser uploads the file straight to storage first (POST /api/files/upload-url),
 * then calls this with the resulting path. On success the teacher gets an in-app
 * notification carrying a one-tap WhatsApp link back to the student.
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { getDoc, updateDoc, nowISO } from '@/lib/firebase/firestore';
import { COLLECTIONS, ASSESSMENT_ALLOWED_MIME_TYPES, ASSESSMENT_MAX_SIZE_BYTES } from '@/domain/constants';
import { writeAuditLog, extractRequestMeta } from '@/services/audit/log';
import { createNotification } from '@/services/notifications/create';
import { whatsAppLink, firstName } from '@/lib/whatsapp';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const SubmitSchema = z.object({
  videoPath: z.string().min(1),
  videoProvider: z.enum(['supabase', 'firebase']).default('supabase'),
  mimeType: z.string().min(1),
  fileName: z.string().min(1),
  fileSizeBytes: z.number().int().positive(),
  durationSeconds: z.number().positive().optional(),
  studentNote: z.string().max(1000).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const auth = await requireAuth(request, ['student', 'teacher', 'super_admin']);
    const { id } = params;

    const parsed = SubmitSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return Response.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }
    const { videoPath, videoProvider, mimeType, fileName, fileSizeBytes, durationSeconds, studentNote } = parsed.data;

    // Video only — a plain audio recording cannot show the taalam
    if (!ASSESSMENT_ALLOWED_MIME_TYPES.includes(mimeType) && !mimeType.startsWith('video/')) {
      return Response.json(
        { error: 'Please upload a video file (MP4, WebM or MOV) so your taalam is visible.' },
        { status: 400 },
      );
    }
    if (fileSizeBytes > ASSESSMENT_MAX_SIZE_BYTES) {
      return Response.json(
        { error: `Video is too large (max ${Math.floor(ASSESSMENT_MAX_SIZE_BYTES / 1024 / 1024)} MB).` },
        { status: 413 },
      );
    }

    const assessment = await getDoc<Record<string, unknown>>(COLLECTIONS.LESSON_ASSESSMENTS, id);
    if (!assessment) {
      return Response.json({ error: 'Assessment not found' }, { status: 404 });
    }

    // Students may only submit their own assessment, into their own folder
    if (auth.role === 'student') {
      if (assessment.studentId !== auth.uid) {
        return Response.json({ error: 'This assessment belongs to another student' }, { status: 403 });
      }
      if (!videoPath.startsWith(`recordings/${auth.uid}/assessments/`)) {
        return Response.json({ error: 'Invalid storage path' }, { status: 400 });
      }
    }

    if (assessment.status === 'graded') {
      return Response.json(
        { error: 'This assessment has already been graded and can no longer be changed.' },
        { status: 409 },
      );
    }

    await updateDoc(COLLECTIONS.LESSON_ASSESSMENTS, id, {
      status: 'submitted',
      videoPath,
      videoProvider,
      videoMimeType: mimeType,
      videoFileName: fileName,
      videoSizeBytes: fileSizeBytes,
      videoDurationSeconds: durationSeconds ?? null,
      studentNote: studentNote ?? null,
      submittedAt: nowISO(),
      updatedAt: nowISO(),
    });

    const { ipAddress, userAgent } = extractRequestMeta(request);
    await writeAuditLog({
      actorId: auth.uid,
      actorRole: auth.role,
      action: 'ASSESSMENT_CREATED',
      entityType: 'lesson_assessment',
      entityId: id,
      newState: { status: 'submitted', fileName },
      ipAddress,
      userAgent,
    });

    // Notify the teacher that a video is waiting, with a WhatsApp link back
    // to the student. Never let a notification failure fail the submission.
    try {
      const teacherId = assessment.teacherId as string | undefined;
      const studentName = (assessment.studentName as string) || 'A student';
      const title = (assessment.title as string) || 'assessment';

      if (teacherId) {
        const studentProfile = await getDoc<Record<string, unknown>>(
          COLLECTIONS.STUDENT_PROFILES,
          assessment.studentId as string,
        );
        const link = whatsAppLink(
          (studentProfile?.phone as string) ?? null,
          `Hi ${firstName(studentName)}, I've received your ${title} video. I'll review it and share your grade shortly.`,
        );

        await createNotification({
          recipientId: teacherId,
          type: 'RECORDING_SUBMITTED',
          title: 'Assessment video submitted',
          body: `${studentName} uploaded their video for ${title}. Watch it and grade when you're ready.`,
          referenceType: 'lesson_assessment',
          referenceId: id,
          actionUrl: link,
          actionLabel: link ? `Message ${firstName(studentName)} on WhatsApp` : null,
        });
      }
    } catch (notifyError) {
      console.error('[ASSESSMENT_SUBMIT_NOTIFY_FAILED]', id, notifyError);
    }

    return Response.json({ success: true, assessmentId: id, status: 'submitted' });
  } catch (error) {
    return authErrorResponse(error);
  }
}
