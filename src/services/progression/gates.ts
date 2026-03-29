/**
 * services/progression/gates.ts
 *
 * Progression gate checks and student advancement logic.
 * A student can only advance to the next teaching unit when ALL gates are passed.
 *
 * Gate conditions (all required):
 *   1. Current unit masteryStage === 'passed'
 *   2. Practice recording submitted and accepted (if required by settings)
 *   3. Testing result === 'pass' (if required by settings)
 *   4. Teacher explicitly confirmed readiness
 *
 * The teacher always initiates the final unlock — it is never automatic.
 */

import { getDoc, queryDocs, updateDoc, createDoc, nowISO, type QueryConstraint } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';
import type { AppSettings, ProgressionStatus, RecordingReview, LessonAssessment, StudentProfile, TeachingUnit, SyllabusLesson } from '@/domain/types';

export interface ProgressionGateResult {
  allGatesPassed: boolean;
  masteryPassed: boolean;
  recordingAccepted: boolean;
  recordingRequired: boolean;
  testPassed: boolean;
  testRequired: boolean;
  teacherConfirmedReadiness: boolean;
  blockers: string[];
}

/**
 * Check all progression gates for a student on their current teaching unit.
 * Returns a detailed result showing which gates are passed and which are blocking.
 */
export async function checkProgressionGates(
  studentId: string,
  teachingUnitId: string,
  settings: AppSettings
): Promise<ProgressionGateResult> {
  const blockers: string[] = [];

  // 1. Mastery stage must be 'passed'
  const progressions = await queryDocs<ProgressionStatus>(COLLECTIONS.PROGRESSION_STATUS, [
    { type: 'where', field: 'studentId', op: '==', value: studentId },
    { type: 'where', field: 'teachingUnitId', op: '==', value: teachingUnitId },
  ]);
  const progression = progressions[0] ?? null;
  const masteryPassed = progression?.masteryStage === 'passed';
  if (!masteryPassed) {
    blockers.push(`Mastery stage is '${progression?.masteryStage ?? 'not started'}', needs 'passed'`);
  }

  // 2. Recording accepted (if required)
  const recordingRequired = settings.progressionRequiresRecordingAccepted;
  let recordingAccepted = true;
  if (recordingRequired) {
    const reviews = await queryDocs<RecordingReview>(COLLECTIONS.RECORDING_REVIEWS, [
      { type: 'where', field: 'recordingId', op: '==', value: progression?.lastRecordingId ?? '' },
      { type: 'where', field: 'status', op: '==', value: 'accepted' },
    ]);
    recordingAccepted = reviews.length > 0;
    if (!recordingAccepted) {
      blockers.push('Practice recording not yet accepted by teacher');
    }
  }

  // 3. Test passed (if required)
  const testRequired = settings.progressionRequiresTestPass;
  let testPassed = true;
  if (testRequired) {
    const assessments = await queryDocs<LessonAssessment>(COLLECTIONS.LESSON_ASSESSMENTS, [
      { type: 'where', field: 'studentId', op: '==', value: studentId },
      { type: 'where', field: 'teachingUnitId', op: '==', value: teachingUnitId },
      { type: 'where', field: 'result', op: '==', value: 'pass' },
    ]);
    testPassed = assessments.length > 0;
    if (!testPassed) {
      blockers.push('No passing assessment found for this teaching unit');
    }
  }

  // 4. Teacher confirmed readiness (from the latest assessment)
  let teacherConfirmedReadiness = false;
  if (progression?.lastAssessmentId) {
    const assessment = await getDoc<LessonAssessment>(COLLECTIONS.LESSON_ASSESSMENTS, progression.lastAssessmentId);
    teacherConfirmedReadiness = assessment?.readinessForNext ?? false;
  }
  if (!teacherConfirmedReadiness) {
    blockers.push('Teacher has not confirmed readiness for next unit');
  }

  return {
    allGatesPassed: masteryPassed && recordingAccepted && testPassed && teacherConfirmedReadiness,
    masteryPassed,
    recordingAccepted,
    recordingRequired,
    testPassed,
    testRequired,
    teacherConfirmedReadiness,
    blockers,
  };
}

/**
 * Advance a student to the next teaching unit.
 * Called by teacher after all gates are verified.
 *
 * @param studentId - Student to advance
 * @param currentUnitId - The unit being completed
 * @param nextUnitId - The unit to advance to
 * @param teacherId - The teacher performing the advancement
 */
export async function advanceStudent(
  studentId: string,
  currentUnitId: string,
  nextUnitId: string,
  teacherId: string
): Promise<void> {
  // Mark current unit as no longer current
  const currentProgressions = await queryDocs<ProgressionStatus>(COLLECTIONS.PROGRESSION_STATUS, [
    { type: 'where', field: 'studentId', op: '==', value: studentId },
    { type: 'where', field: 'teachingUnitId', op: '==', value: currentUnitId },
  ]);
  if (currentProgressions[0]) {
    await updateDoc(COLLECTIONS.PROGRESSION_STATUS, currentProgressions[0].id, {
      isCurrentUnit: false,
    });
  }

  // Create progression record for the next unit
  await createDoc(COLLECTIONS.PROGRESSION_STATUS, {
    studentId,
    lessonId: '', // Will be resolved from the teaching unit
    teachingUnitId: nextUnitId,
    masteryStage: 'introduced',
    startedAt: nowISO(),
    passedAt: null,
    lastAssessmentId: null,
    lastRecordingId: null,
    teacherPlacedAt: nowISO(),
    placedBy: teacherId,
    isCurrentUnit: true,
    notes: '',
  });

  // Look up the next unit to determine its lesson and batch band
  const nextUnit = await getDoc<TeachingUnit>(COLLECTIONS.TEACHING_UNITS, nextUnitId);
  if (nextUnit) {
    const lesson = await getDoc<SyllabusLesson>(COLLECTIONS.SYLLABUS_LESSONS, nextUnit.lessonId);

    // Update student profile with new current position
    await updateDoc(COLLECTIONS.STUDENT_PROFILES, studentId, {
      currentTeachingUnitId: nextUnitId,
      currentLessonId: nextUnit.lessonId,
      currentMasteryStage: 'introduced',
      currentBatchBandId: lesson?.batchBandCode ?? '',
    });
  }
}
