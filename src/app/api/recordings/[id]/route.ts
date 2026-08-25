/**
 * API: GET /api/recordings/[id]
 *
 * Returns a single practice recording enriched with student name, unit name,
 * and last review data (feedback, scores). Students can only access their own;
 * teachers and admins can access any.
 *
 * Returns the recording fields flat (not nested in { recording: {} }) so the
 * teacher review page can use the response directly.
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { getDoc } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';
import { supabaseConfigured, getSupabaseSignedUrl } from '@/lib/storage/supabase';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(request);
    const { id } = params;

    const recording = await getDoc<Record<string, unknown>>(COLLECTIONS.PRACTICE_RECORDINGS, id);

    if (!recording) {
      return Response.json({ error: 'Recording not found' }, { status: 404 });
    }

    if (auth.role === 'student' && recording.studentId !== auth.uid) {
      return Response.json({ error: 'Access denied' }, { status: 403 });
    }

    // Parallel lookups for enrichment
    const [studentProfile, teachingUnit, lastReview] = await Promise.all([
      getDoc<{ fullName?: string }>(COLLECTIONS.STUDENT_PROFILES, recording.studentId as string),
      getDoc<{ unitName?: string }>(COLLECTIONS.TEACHING_UNITS, recording.teachingUnitId as string),
      recording.lastReviewId
        ? getDoc<{ feedback?: string | null; scores?: Record<string, number> | null; status?: string }>(
            COLLECTIONS.RECORDING_REVIEWS,
            recording.lastReviewId as string,
          )
        : Promise.resolve(null),
    ]);

    // Playable URL: recordings stored in Supabase get a 1-hour signed URL.
    // Legacy Firebase-stored recordings return null — the client falls back
    // to the Firebase SDK's getDownloadURL for those.
    let audioUrl: string | null = null;
    if (recording.storagePath && recording.storageProvider === 'supabase' && supabaseConfigured()) {
      try {
        audioUrl = await getSupabaseSignedUrl(recording.storagePath as string, 3600);
      } catch {
        // Leave audioUrl null; the UI shows "audio unavailable"
      }
    }

    return Response.json({
      ...recording,
      audioUrl,
      studentName:    studentProfile?.fullName ?? '',
      unitName:       teachingUnit?.unitName ?? (recording.teachingUnitId as string) ?? '',
      existingFeedback: lastReview?.feedback ?? null,
      pitchScore:     lastReview?.scores?.pitchScore ?? null,
      rhythmScore:    lastReview?.scores?.rhythmScore ?? null,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
