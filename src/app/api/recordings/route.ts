/**
 * API: GET/POST /api/recordings
 *
 * Practice recordings management.
 * - GET: List recordings (student sees own, teacher filters by studentId query param)
 * - POST: Student submits recording metadata after upload to Firebase Storage
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { createDoc, queryDocs, getDoc, nowISO } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';
import { writeAuditLog, extractRequestMeta } from '@/services/audit/log';
import { z } from 'zod';

const SubmitRecordingSchema = z.object({
  teachingUnitId: z.string().min(1),
  storagePath: z.string().min(1),
  storageProvider: z.enum(['supabase', 'firebase']).optional(),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  fileSizeBytes: z.number().int().positive(),
  durationSeconds: z.number().positive(),
  consentGiven: z.literal(true),
});

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);

    const { searchParams } = new URL(request.url);
    const studentId = auth.role === 'student' ? auth.uid : searchParams.get('studentId');

    // Fetch with only the WHERE filter (no orderBy in the query) so the
    // query works without a composite Firestore index. Sort by createdAt
    // descending in memory after fetching — recordings list is small.
    const filters: { type: 'where'; field: string; op: '=='; value: string }[] = [];
    if (studentId) {
      filters.push({ type: 'where', field: 'studentId', op: '==', value: studentId });
    }

    const recordings = await queryDocs<Record<string, unknown> & { id: string }>(
      COLLECTIONS.PRACTICE_RECORDINGS,
      filters,
    );

    recordings.sort((a, b) => {
      const aTime = (a.createdAt as string) ?? (a.submittedAt as string) ?? '';
      const bTime = (b.createdAt as string) ?? (b.submittedAt as string) ?? '';
      return bTime.localeCompare(aTime);
    });

    // Enrich with human-readable student names and unit names (parallel lookups).
    const uniqueStudentIds = [...new Set(recordings.map(r => r.studentId as string).filter(Boolean))];
    const uniqueUnitIds    = [...new Set(recordings.map(r => r.teachingUnitId as string).filter(Boolean))];

    const [studentEntries, unitEntries] = await Promise.all([
      Promise.all(uniqueStudentIds.map(id =>
        getDoc<{ fullName?: string }>(COLLECTIONS.STUDENT_PROFILES, id).then(p => [id, p?.fullName ?? ''] as const)
      )),
      Promise.all(uniqueUnitIds.map(id =>
        getDoc<{ unitName?: string }>(COLLECTIONS.TEACHING_UNITS, id).then(u => [id, u?.unitName ?? ''] as const)
      )),
    ]);

    const studentMap = new Map(studentEntries);
    const unitMap    = new Map(unitEntries);

    const enriched = recordings.map(r => ({
      ...r,
      studentName: studentMap.get(r.studentId as string) ?? '',
      unitName:    unitMap.get(r.teachingUnitId as string) ?? (r.teachingUnitId as string) ?? '',
    }));

    return Response.json({ recordings: enriched });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    // Students submit practice recordings; teacher/super_admin can also submit
    // so every account type can verify the recording flow end-to-end.
    const auth = await requireAuth(request, ['student', 'teacher', 'super_admin']);
    const body = await request.json();
    const parsed = SubmitRecordingSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const { teachingUnitId, storagePath, storageProvider, fileName, mimeType, fileSizeBytes, durationSeconds } = parsed.data;

    const recordingId = await createDoc(COLLECTIONS.PRACTICE_RECORDINGS, {
      studentId: auth.uid,
      teachingUnitId,
      storagePath,
      storageProvider: storageProvider ?? 'supabase',
      fileName,
      mimeType,
      fileSizeBytes,
      durationSeconds,
      consentGiven: true,
      status: 'submitted',
      submittedAt: nowISO(),
      createdAt: nowISO(),
    });

    const { ipAddress, userAgent } = extractRequestMeta(request);
    await writeAuditLog({
      actorId: auth.uid,
      actorRole: auth.role,
      action: 'RECORDING_SUBMITTED',
      entityType: 'practice_recording',
      entityId: recordingId,
      newState: { teachingUnitId, fileName, status: 'submitted' },
      ipAddress,
      userAgent,
    });

    return Response.json({ success: true, recordingId });
  } catch (error) {
    return authErrorResponse(error);
  }
}
