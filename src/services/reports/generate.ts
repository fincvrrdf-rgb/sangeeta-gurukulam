/**
 * services/reports/generate.ts
 *
 * AI-assisted weekly report generation. Collects student data for the week,
 * sends a structured prompt to Groq, and saves the draft for teacher review.
 *
 * Reports are ALWAYS in 'ai_draft' status until teacher reviews and publishes.
 */

import { queryDocs, createDoc, getDoc, nowISO, type QueryConstraint } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';
import { callGroqSimple } from '@/lib/ai/groq';
import type {
  AttendanceRecord,
  PracticeRecording,
  RecordingReview,
  LessonAssessment,
  ProgressionStatus,
  LessonPlanItem,
  StudentProfile,
  TeachingUnit,
} from '@/domain/types';

interface GenerateReportInput {
  studentId: string;
  teacherId: string;
  weekOf: string; // 'YYYY-WW'
}

/**
 * Generate an AI-assisted weekly report for a student.
 * Collects attendance, recordings, assessments, and progression data,
 * then sends to Groq for a structured summary.
 *
 * Returns the ID of the created weekly report (status: 'ai_draft').
 */
export async function generateWeeklyReport(input: GenerateReportInput): Promise<string> {
  const { studentId, teacherId, weekOf } = input;

  const student = await getDoc<StudentProfile>(COLLECTIONS.STUDENT_PROFILES, studentId);
  if (!student) throw new Error(`Student not found: ${studentId}`);

  // Gather data for the week
  const [attendance, recordings, assessments, progression] = await Promise.all([
    queryDocs<AttendanceRecord>(COLLECTIONS.ATTENDANCE_RECORDS, [
      { type: 'where', field: 'studentId', op: '==', value: studentId },
    ]),
    queryDocs<PracticeRecording>(COLLECTIONS.PRACTICE_RECORDINGS, [
      { type: 'where', field: 'studentId', op: '==', value: studentId },
      { type: 'where', field: 'weekOf', op: '==', value: weekOf },
    ]),
    queryDocs<LessonAssessment>(COLLECTIONS.LESSON_ASSESSMENTS, [
      { type: 'where', field: 'studentId', op: '==', value: studentId },
    ]),
    queryDocs<ProgressionStatus>(COLLECTIONS.PROGRESSION_STATUS, [
      { type: 'where', field: 'studentId', op: '==', value: studentId },
      { type: 'where', field: 'isCurrentUnit', op: '==', value: true },
    ]),
  ]);

  const currentUnit = progression[0];
  let unitName = 'Unknown';
  if (currentUnit) {
    const unit = await getDoc<TeachingUnit>(COLLECTIONS.TEACHING_UNITS, currentUnit.teachingUnitId);
    unitName = unit?.unitName ?? 'Unknown';
  }

  // Build prompt
  const attendanceSummary = `Attended: ${attendance.filter(a => a.status === 'attended').length}, Late: ${attendance.filter(a => a.status === 'late').length}, Absent: ${attendance.filter(a => ['absent', 'no_show'].includes(a.status)).length}`;
  const recordingSummary = `Recordings submitted: ${recordings.filter(r => r.status === 'submitted').length}, Reviewed: ${recordings.filter(r => r.status === 'reviewed').length}`;
  const assessmentSummary = assessments.length > 0
    ? `Latest assessment: ${assessments[0].result}, Score: ${assessments[0].totalScore}/${assessments[0].maxScore}`
    : 'No assessment this week';

  const systemPrompt = `You are generating a weekly practice report for a Carnatic devotional music student at Sangeeta Gurukulam.
Keep language simple, warm, culturally respectful, and encouraging.
Return ONLY valid JSON with this structure:
{
  "summary": "2-3 sentence friendly summary of the week",
  "improvementAdvice": "3-5 specific, actionable improvement suggestions",
  "weakAreas": ["array of weak areas identified"],
  "strengths": ["array of strengths observed"],
  "practiceRecommendation": "what to focus on before next class"
}`;

  const userMessage = `Student: ${student.fullName}
Current level: ${unitName} (mastery: ${currentUnit?.masteryStage ?? 'N/A'})
Attendance this week: ${attendanceSummary}
Practice: ${recordingSummary}
Assessment: ${assessmentSummary}

Generate the weekly report.`;

  let aiOutput: string;
  try {
    aiOutput = await callGroqSimple(systemPrompt, userMessage, { temperature: 0.4 });
  } catch (error) {
    // AI unavailable — create report without AI content
    aiOutput = JSON.stringify({
      summary: 'AI report generation was unavailable this week. Teacher will provide manual feedback.',
      improvementAdvice: '',
      weakAreas: [],
      strengths: [],
      practiceRecommendation: '',
    });
    console.error('[REPORT_AI_FAILED]', error);
  }

  // Parse AI output
  let parsed;
  try {
    parsed = JSON.parse(aiOutput);
  } catch {
    parsed = {
      summary: aiOutput,
      improvementAdvice: '',
      weakAreas: [],
      strengths: [],
      practiceRecommendation: '',
    };
  }

  // Save AI feedback draft
  const draftId = await createDoc(COLLECTIONS.AI_FEEDBACK_DRAFTS, {
    reportId: '', // will be updated
    studentId,
    weekOf,
    generatedAt: nowISO(),
    rawOutput: aiOutput,
    parsedSummary: parsed.summary ?? '',
    parsedImprovementAdvice: parsed.improvementAdvice ?? '',
    parsedWeakAreas: parsed.weakAreas ?? [],
    parsedStrengths: parsed.strengths ?? [],
    isAssistiveOnly: true,
    status: 'pending_review',
    reviewedBy: null,
    reviewedAt: null,
    editorChanges: {},
  });

  // Create weekly report in 'ai_draft' status
  const reportId = await createDoc(COLLECTIONS.WEEKLY_REPORTS, {
    studentId,
    teacherId,
    weekOf,
    lessonsCovered: [],
    practiceSongs: [],
    lyricsToRevise: [],
    weakAreas: parsed.weakAreas ?? [],
    strengths: parsed.strengths ?? [],
    readinessForNext: false,
    requiredRecordingBeforeNextClass: parsed.practiceRecommendation ?? '',
    teacherRemarks: '',
    aiSummary: parsed.summary ?? '',
    aiImprovementAdvice: parsed.improvementAdvice ?? '',
    aiDraftId: draftId,
    status: 'ai_draft',
    publishedAt: null,
    publishedBy: null,
  });

  return reportId;
}
