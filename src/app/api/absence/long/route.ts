/**
 * API: /api/absence/long
 *
 * GET  — List long absence records (student: own, teacher/admin: all)
 * POST — Student requests a long absence period
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { createDoc, queryDocs, nowISO } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';
import { writeAuditLog, extractRequestMeta } from '@/services/audit/log';
import type { LongAbsenceRecord } from '@/domain/types';
import { z } from 'zod';

const LongAbsenceSchema = z.object({
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  reason: z.string().min(1),
  reasonCategory: z.enum(['vacation', 'travel', 'illness', 'exams', 'family', 'other']),
});

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['student', 'teacher', 'super_admin']);

    const constraints =
      auth.role === 'student'
        ? [{ type: 'where' as const, field: 'studentId', op: '==' as const, value: auth.uid }]
        : [];

    const records = await queryDocs<LongAbsenceRecord>(COLLECTIONS.LONG_ABSENCE_RECORDS, [
      ...constraints,
      { type: 'orderBy', field: 'createdAt', direction: 'desc' },
    ]);

    return Response.json({ records });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['student']);
    const body = await request.json();
    const parsed = LongAbsenceSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const { startDate, endDate, reason, reasonCategory } = parsed.data;

    if (new Date(endDate) <= new Date(startDate)) {
      return Response.json({ error: 'endDate must be after startDate' }, { status: 400 });
    }

    // Create long absence record with pending status
    const recordId = await createDoc(COLLECTIONS.LONG_ABSENCE_RECORDS, {
      studentId: auth.uid,
      startDate,
      endDate,
      reason,
      reasonCategory,
      notes: '',
      status: 'pending',
      approvedBy: null,
      approvedAt: null,
      teacherNotified: false,
      updatedAt: nowISO(),
    });

    // Audit log
    const { ipAddress, userAgent } = extractRequestMeta(request);
    await writeAuditLog({
      actorId: auth.uid,
      actorRole: auth.role,
      action: 'LONG_ABSENCE_SUBMITTED',
      entityType: 'long_absence_record',
      entityId: recordId,
      newState: { startDate, endDate, reason, reasonCategory, status: 'pending' },
      ipAddress,
      userAgent,
    });

    return Response.json({ success: true, recordId });
  } catch (error) {
    return authErrorResponse(error);
  }
}
