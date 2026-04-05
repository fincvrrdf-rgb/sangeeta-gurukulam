/**
 * API: POST /api/reports/[id]/publish
 *
 * Teacher publishes a weekly report, making it visible to the student.
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { getDoc, updateDoc, nowISO } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';
import { writeAuditLog, extractRequestMeta } from '@/services/audit/log';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request, ['teacher', 'super_admin']);
    const { id } = await params;

    const body = await request.json().catch(() => ({}));
    const teacherRemarks = typeof body.feedback === 'string' ? body.feedback : null;

    const report = await getDoc<{ id: string; status: string }>(COLLECTIONS.WEEKLY_REPORTS, id);

    if (!report) {
      return Response.json({ error: 'Report not found' }, { status: 404 });
    }

    if (report.status === 'published') {
      return Response.json({ error: 'Report is already published' }, { status: 400 });
    }

    await updateDoc(COLLECTIONS.WEEKLY_REPORTS, id, {
      status: 'published',
      publishedAt: nowISO(),
      publishedBy: auth.uid,
      ...(teacherRemarks !== null ? { teacherRemarks } : {}),
    });

    const { ipAddress, userAgent } = extractRequestMeta(request);
    await writeAuditLog({
      actorId: auth.uid,
      actorRole: auth.role,
      action: 'WEEKLY_REPORT_PUBLISHED',
      entityType: 'weekly_report',
      entityId: id,
      previousState: { status: report.status },
      newState: { status: 'published' },
      ipAddress,
      userAgent,
    });

    return Response.json({ success: true, reportId: id });
  } catch (error) {
    return authErrorResponse(error);
  }
}
