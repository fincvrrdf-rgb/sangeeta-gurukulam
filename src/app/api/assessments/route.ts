/**
 * API: GET/POST /api/assessments
 *
 * Lesson assessments.
 * - GET:  List assessments (teacher: ones they set, student: their own)
 * - POST: Teacher ASSIGNS a test to a student. The student then uploads a
 *         video of themselves performing it, and the teacher grades it after
 *         watching — see /api/assessments/[id]/submit and PATCH /api/assessments/[id].
 *
 * Lifecycle: assigned → submitted → graded
 *
 * Scores may still be supplied at creation time (the older one-shot flow), in
 * which case the assessment is created already graded.
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { createDoc, getDoc, queryDocs, nowISO } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';
import { writeAuditLog, extractRequestMeta } from '@/services/audit/log';
import { createNotification } from '@/services/notifications/create';
import { whatsAppLink, firstName } from '@/lib/whatsapp';
import { z } from 'zod';

const CreateAssessmentSchema = z.object({
  studentId: z.string().min(1),
  teachingUnitId: z.string().min(1),
  assessmentType: z.enum(['formative', 'testing_day', 'makeup']),
  title: z.string().max(200).optional(),
  instructions: z.string().max(2000).optional(),
  dueDate: z.string().optional(),
  // Present only when the teacher grades immediately instead of assigning.
  // The rubric form posts `rubricScores` as an array; accept both shapes.
  scores: z.record(z.string(), z.number()).optional(),
  rubricScores: z.array(z.object({
    dimensionKey: z.string(),
    score: z.number(),
    maxScore: z.number().optional(),
  })).optional(),
  totalScore: z.number().optional(),
  maxScore: z.number().positive().optional(),
  result: z.enum(['pass', 'fail', 'needs_improvement']).optional(),
  feedback: z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);

    const { searchParams } = new URL(request.url);

    let constraints;
    if (auth.role === 'student') {
      constraints = [
        { type: 'where' as const, field: 'studentId', op: '==' as const, value: auth.uid },
        { type: 'orderBy' as const, field: 'createdAt', direction: 'desc' as const },
      ];
    } else {
      const teacherId = searchParams.get('teacherId') ?? auth.uid;
      constraints = [
        { type: 'where' as const, field: 'teacherId', op: '==' as const, value: teacherId },
        { type: 'orderBy' as const, field: 'createdAt', direction: 'desc' as const },
      ];
    }

    const raw = await queryDocs<Record<string, unknown>>(COLLECTIONS.LESSON_ASSESSMENTS, constraints);

    // Normalise: older records predate studentName and the status lifecycle
    const assessments = raw.map((a) => ({
      ...a,
      studentName: (a.studentName as string) || (a.studentId as string) || 'Unknown',
      status: (a.status as string) || (a.result ? 'graded' : 'assigned'),
    }));

    return Response.json({ assessments });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['teacher', 'super_admin']);
    const body = await request.json();
    const parsed = CreateAssessmentSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const {
      studentId, teachingUnitId, assessmentType, title, instructions, dueDate,
      scores, rubricScores, totalScore, maxScore, result, feedback,
    } = parsed.data;

    // Normalise the rubric form's array shape into a flat {key: score} record
    const normalisedScores = scores
      ?? (rubricScores
        ? Object.fromEntries(rubricScores.map((d) => [d.dimensionKey, d.score]))
        : null);

    // Graded on creation only when the teacher supplied a verdict
    const gradedNow = Boolean(result);

    // Resolve student name — co-learners use a _dependent virtual ID
    const isCoLearner = studentId.endsWith('_dependent');
    const primaryId = isCoLearner ? studentId.replace('_dependent', '') : studentId;
    const profile = await getDoc<Record<string, unknown>>(COLLECTIONS.STUDENT_PROFILES, primaryId);
    const studentName = isCoLearner
      ? (profile?.dependentName as string) ?? studentId
      : (profile?.fullName as string) ?? studentId;

    const unit = await getDoc<{ unitName?: string }>(COLLECTIONS.TEACHING_UNITS, teachingUnitId);
    const unitName = unit?.unitName ?? teachingUnitId;

    const assessmentId = await createDoc(COLLECTIONS.LESSON_ASSESSMENTS, {
      studentId,
      studentName,
      teacherId: auth.uid,
      teachingUnitId,
      assessmentType,
      title: title ?? `${unitName} assessment`,
      instructions: instructions ?? null,
      dueDate: dueDate ?? null,
      status: gradedNow ? 'graded' : 'assigned',
      // Video submission — filled in by the student
      videoPath: null,
      videoProvider: null,
      videoMimeType: null,
      videoFileName: null,
      videoSizeBytes: null,
      submittedAt: null,
      // Grading
      scores: normalisedScores,
      totalScore: totalScore ?? null,
      maxScore: maxScore ?? null,
      result: result ?? null,
      feedback: feedback ?? null,
      assessedAt: gradedNow ? nowISO() : null,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    });

    const { ipAddress, userAgent } = extractRequestMeta(request);
    await writeAuditLog({
      actorId: auth.uid,
      actorRole: auth.role,
      action: 'ASSESSMENT_CREATED',
      entityType: 'lesson_assessment',
      entityId: assessmentId,
      newState: { studentId, teachingUnitId, assessmentType, status: gradedNow ? 'graded' : 'assigned' },
      ipAddress,
      userAgent,
    });

    // Tell the student a test is waiting, and hand the teacher a WhatsApp link
    // so they can nudge them directly. Notification failure must never fail the request.
    let whatsapp: string | null = null;
    try {
      const studentPhone = (profile?.phone as string) ?? null;
      whatsapp = whatsAppLink(
        studentPhone,
        gradedNow
          ? `Hi ${firstName(studentName)}, your ${unitName} assessment has been graded. Open Sangeeta Gurukulam to see the feedback.`
          : `Hi ${firstName(studentName)}, I've set a ${unitName} assessment for you. ` +
            `Please record a video (so your taalam is visible) and upload it in Sangeeta Gurukulam → Assessments.`,
      );

      if (!isCoLearner) {
        await createNotification({
          recipientId: studentId,
          type: gradedNow ? 'ASSESSMENT_GRADED' : 'TESTING_DAY_UPCOMING',
          title: gradedNow ? 'Assessment graded' : 'New assessment assigned',
          body: gradedNow
            ? `Your ${unitName} assessment has been graded: ${result}.`
            : `${unitName} — record a video of yourself performing it and upload it from Assessments.`,
          referenceType: 'lesson_assessment',
          referenceId: assessmentId,
        });
      }
    } catch (notifyError) {
      console.error('[ASSESSMENT_NOTIFY_FAILED]', assessmentId, notifyError);
    }

    return Response.json({
      success: true,
      assessmentId,
      status: gradedNow ? 'graded' : 'assigned',
      result: result ?? null,
      /** Teacher-facing one-tap nudge; null when the student has no usable number */
      whatsappLink: whatsapp,
      studentName,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
