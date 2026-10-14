/**
 * API: GET/PATCH/DELETE /api/assessments/[id]
 *
 * - GET:    Any authenticated user (students see their own only). Includes a
 *           short-lived signed videoUrl so the teacher can watch the submission.
 * - PATCH:  Teacher or admin grades the assessment. Supplying a `result` moves
 *           it to 'graded' and notifies the student (with a WhatsApp link back
 *           to the teacher).
 * - DELETE: Teacher or admin removes it.
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { getDoc, updateDoc, deleteDoc, nowISO } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';
import { writeAuditLog, extractRequestMeta } from '@/services/audit/log';
import { createNotification } from '@/services/notifications/create';
import { whatsAppLink, firstName } from '@/lib/whatsapp';
import { getSupabaseSignedUrl, supabaseConfigured, BUCKETS } from '@/lib/storage/supabase';
import { z } from 'zod';

const UpdateAssessmentSchema = z.object({
  scores: z.record(z.string(), z.number()).optional(),
  totalScore: z.number().optional(),
  maxScore: z.number().positive().optional(),
  result: z.enum(['pass', 'fail', 'needs_improvement']).optional(),
  feedback: z.string().optional(),
  title: z.string().max(200).optional(),
  instructions: z.string().max(2000).optional(),
  dueDate: z.string().optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: 'At least one field must be provided for update',
});

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(request);
    const { id } = params;

    const assessment = await getDoc<Record<string, unknown>>(COLLECTIONS.LESSON_ASSESSMENTS, id);
    if (!assessment) {
      return Response.json({ error: 'Assessment not found' }, { status: 404 });
    }

    // Students can only see their own assessments
    if (auth.role === 'student' && assessment.studentId !== auth.uid) {
      return Response.json({ error: 'Access denied' }, { status: 403 });
    }

    // Signed playback URL for the submitted video (Supabase-stored only;
    // Firebase-stored videos are resolved client-side via the Firebase SDK).
    let videoUrl: string | null = null;
    if (assessment.videoPath && assessment.videoProvider === 'supabase' && supabaseConfigured()) {
      try {
        videoUrl = await getSupabaseSignedUrl(assessment.videoPath as string, 3600, BUCKETS.recordings);
      } catch {
        // Leave null — the UI shows "video unavailable"
      }
    }

    // Readable names for records that only stored IDs
    let unitName = assessment.teachingUnitName as string | undefined;
    if (!unitName && assessment.teachingUnitId) {
      unitName = (await getDoc<{ unitName?: string }>(COLLECTIONS.TEACHING_UNITS, assessment.teachingUnitId as string))?.unitName;
    }
    let studentName = assessment.studentName as string | undefined;
    if (!studentName && assessment.studentId) {
      studentName = (await getDoc<{ fullName?: string }>(
        COLLECTIONS.STUDENT_PROFILES, String(assessment.studentId).replace(/_dependent$/, ''),
      ))?.fullName;
    }
    const title = !assessment.title || assessment.title === `${assessment.teachingUnitId} assessment`
      ? `${unitName || 'Lesson'} assessment`
      : (assessment.title as string);

    return Response.json({
      assessment: {
        ...assessment,
        teachingUnitName: unitName || 'Lesson',
        studentName: studentName || 'Student',
        title,
        status: (assessment.status as string) || (assessment.result ? 'graded' : 'assigned'),
      },
      videoUrl,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(request, ['teacher', 'super_admin']);
    const { id } = params;
    const body = await request.json();
    const parsed = UpdateAssessmentSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const assessment = await getDoc<Record<string, unknown>>(COLLECTIONS.LESSON_ASSESSMENTS, id);
    if (!assessment) {
      return Response.json({ error: 'Assessment not found' }, { status: 404 });
    }

    // A verdict means this is the grading step
    const isGrading = Boolean(parsed.data.result);
    const updates: Record<string, unknown> = { ...parsed.data, updatedAt: nowISO() };
    if (isGrading) {
      updates.status = 'graded';
      updates.assessedAt = nowISO();
      updates.gradedBy = auth.uid;
    }

    await updateDoc(COLLECTIONS.LESSON_ASSESSMENTS, id, updates);

    const { ipAddress, userAgent } = extractRequestMeta(request);
    await writeAuditLog({
      actorId: auth.uid,
      actorRole: auth.role,
      action: 'ASSESSMENT_UPDATED',
      entityType: 'lesson_assessment',
      entityId: id,
      previousState: assessment,
      newState: updates,
      ipAddress,
      userAgent,
    });

    // On grading, tell the student their result. Never fail the request over it.
    let whatsapp: string | null = null;
    if (isGrading) {
      try {
        const studentId = assessment.studentId as string;
        const studentName = (assessment.studentName as string) || 'student';
        const title = (assessment.title as string) || 'assessment';
        const result = parsed.data.result;
        const total = parsed.data.totalScore ?? assessment.totalScore;
        const max = parsed.data.maxScore ?? assessment.maxScore;
        const scoreText = total != null && max != null ? ` (${total}/${max})` : '';

        const verdict =
          result === 'pass' ? 'Passed' :
          result === 'needs_improvement' ? 'Needs improvement' : 'Not passed';

        // Student-facing link to reply to their teacher
        const teacherProfile = await getDoc<Record<string, unknown>>(
          COLLECTIONS.TEACHER_PROFILES,
          assessment.teacherId as string,
        );
        const studentProfile = await getDoc<Record<string, unknown>>(
          COLLECTIONS.STUDENT_PROFILES,
          studentId,
        );

        const studentLink = whatsAppLink(
          (teacherProfile?.phone as string) ?? null,
          `Namaste, I've seen my ${title} result. I had a question about the feedback.`,
        );

        // Teacher-facing link, returned so the UI can offer a one-tap message
        whatsapp = whatsAppLink(
          (studentProfile?.phone as string) ?? null,
          `Hi ${firstName(studentName)}, I've graded your ${title}: ${verdict}${scoreText}. ` +
          `Open Sangeeta Gurukulam to read the full feedback.`,
        );

        if (!studentId.endsWith('_dependent')) {
          await createNotification({
            recipientId: studentId,
            type: 'ASSESSMENT_GRADED',
            title: `Assessment graded — ${verdict}`,
            body: `${title}${scoreText}. ${parsed.data.feedback ?? 'Open the assessment to read your teacher’s feedback.'}`,
            referenceType: 'lesson_assessment',
            referenceId: id,
            actionUrl: studentLink,
            actionLabel: studentLink ? 'Message your teacher on WhatsApp' : null,
          });
        }
      } catch (notifyError) {
        console.error('[ASSESSMENT_GRADE_NOTIFY_FAILED]', id, notifyError);
      }
    }

    return Response.json({
      success: true,
      assessmentId: id,
      status: isGrading ? 'graded' : (assessment.status ?? 'assigned'),
      whatsappLink: whatsapp,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request, ['teacher', 'super_admin']);
    const { id } = await params;

    const existing = await getDoc(COLLECTIONS.LESSON_ASSESSMENTS, id);
    if (!existing) {
      return Response.json({ error: 'Assessment not found' }, { status: 404 });
    }

    await deleteDoc(COLLECTIONS.LESSON_ASSESSMENTS, id);

    const { ipAddress, userAgent } = extractRequestMeta(request);
    await writeAuditLog({
      actorId: auth.uid,
      actorRole: auth.role,
      action: 'ASSESSMENT_DELETED',
      entityType: 'lesson_assessment',
      entityId: id,
      previousState: existing as Record<string, unknown>,
      newState: null,
      ipAddress,
      userAgent,
    });

    return Response.json({ success: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}
