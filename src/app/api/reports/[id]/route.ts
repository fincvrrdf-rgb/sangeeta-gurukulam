/**
 * API: GET /api/reports/[id]
 * GET  — Fetch a single weekly report for teacher review.
 * DELETE — Delete a draft report.
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { getDoc, deleteDoc, updateDoc, nowISO } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';
import { writeAuditLog, extractRequestMeta } from '@/services/audit/log';

/** Convert YYYY-WW to the Monday date string YYYY-MM-DD */
function weekOfToDate(weekOf: string): string {
  try {
    const [year, week] = weekOf.split('-').map(Number);
    const jan4 = new Date(year, 0, 4);
    const monday = new Date(
      jan4.getTime() +
        (week - 1) * 7 * 86_400_000 -
        ((jan4.getDay() || 7) - 1) * 86_400_000,
    );
    return monday.toISOString().slice(0, 10);
  } catch {
    return weekOf;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request, ['teacher', 'super_admin']);
    const { id } = await params;

    const raw = await getDoc<Record<string, unknown>>(COLLECTIONS.WEEKLY_REPORTS, id);
    if (!raw) {
      return Response.json({ error: 'Report not found' }, { status: 404 });
    }

    // Fetch student name if studentId present
    let studentName = 'Student';
    if (raw.studentId) {
      const profiles = await import('@/lib/firebase/firestore').then(m =>
        m.queryDocs<Record<string, unknown>>(COLLECTIONS.STUDENT_PROFILES, [
          { type: 'where', field: 'userId', op: '==', value: raw.studentId as string },
        ])
      );
      if (profiles[0]?.fullName) studentName = profiles[0].fullName as string;
    }

    const weekStartDate = weekOfToDate(raw.weekOf as string ?? '');

    const report = {
      id,
      studentName,
      weekStartDate,
      status: raw.status as string,
      aiFeedback: (raw.teacherRemarks as string) || (raw.aiSummary as string) || '',
      attendance: (raw.attendanceSummary as { present?: number; absent?: number; total?: number } | undefined) ?? {
        present: 0,
        absent: 0,
        total: 0,
      },
      practice: (raw.practiceSummary as { recordingsSubmitted?: number; averagePitchScore?: number | null; averageRhythmScore?: number | null } | undefined) ?? {
        recordingsSubmitted: 0,
        averagePitchScore: null,
        averageRhythmScore: null,
      },
    };

    return Response.json(report);
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

    const raw = await getDoc<Record<string, unknown>>(COLLECTIONS.WEEKLY_REPORTS, id);
    if (!raw) {
      return Response.json({ error: 'Report not found' }, { status: 404 });
    }
    if (raw.status === 'published') {
      return Response.json({ error: 'Cannot delete a published report' }, { status: 400 });
    }

    await deleteDoc(COLLECTIONS.WEEKLY_REPORTS, id);

    const { ipAddress, userAgent } = extractRequestMeta(request);
    await writeAuditLog({
      actorId: auth.uid,
      actorRole: auth.role,
      action: 'WEEKLY_REPORT_DELETED',
      entityType: 'weekly_report',
      entityId: id,
      previousState: { status: raw.status },
      newState: null,
      ipAddress,
      userAgent,
    });

    return Response.json({ success: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}
