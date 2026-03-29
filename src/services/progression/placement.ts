/**
 * services/progression/placement.ts
 *
 * Student placement logic for onboarding. Handles:
 *   - Absolute beginners → Lesson 1 / Batch A
 *   - Students with prior knowledge → teacher-placed at higher level
 *   - Bridge/catch-up plans for mid-joining students
 */

import { createDoc, updateDoc, nowISO } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';

interface PlacementInput {
  studentId: string;
  teacherId: string;
  lessonId: string;
  teachingUnitId: string;
  batchBandId: string;
  initialMasteryStage: 'introduced' | 'learning';
  placementNotes: string;
  /** If true, earlier units are marked as 'passed' with pre_assessed reason */
  markEarlierUnitsPassed?: Array<{
    lessonId: string;
    teachingUnitId: string;
  }>;
}

/**
 * Place a student into their initial position in the syllabus.
 * Creates progression_status records and updates the student profile.
 */
export async function placeStudent(input: PlacementInput): Promise<void> {
  const {
    studentId,
    teacherId,
    lessonId,
    teachingUnitId,
    batchBandId,
    initialMasteryStage,
    placementNotes,
    markEarlierUnitsPassed,
  } = input;

  // If earlier units should be marked as passed (for experienced students)
  if (markEarlierUnitsPassed) {
    for (const unit of markEarlierUnitsPassed) {
      await createDoc(COLLECTIONS.PROGRESSION_STATUS, {
        studentId,
        lessonId: unit.lessonId,
        teachingUnitId: unit.teachingUnitId,
        masteryStage: 'passed',
        startedAt: nowISO(),
        passedAt: nowISO(),
        lastAssessmentId: null,
        lastRecordingId: null,
        teacherPlacedAt: nowISO(),
        placedBy: teacherId,
        isCurrentUnit: false,
        notes: 'Pre-assessed: placed by teacher during onboarding',
      });
    }
  }

  // Create the current unit progression record
  await createDoc(COLLECTIONS.PROGRESSION_STATUS, {
    studentId,
    lessonId,
    teachingUnitId,
    masteryStage: initialMasteryStage,
    startedAt: nowISO(),
    passedAt: null,
    lastAssessmentId: null,
    lastRecordingId: null,
    teacherPlacedAt: nowISO(),
    placedBy: teacherId,
    isCurrentUnit: true,
    notes: placementNotes,
  });

  // Update student profile
  await updateDoc(COLLECTIONS.STUDENT_PROFILES, studentId, {
    currentLessonId: lessonId,
    currentTeachingUnitId: teachingUnitId,
    currentMasteryStage: initialMasteryStage,
    currentBatchBandId: batchBandId,
    primaryTeacherId: teacherId,
    onboardingComplete: true,
    placementNotes,
  });
}
