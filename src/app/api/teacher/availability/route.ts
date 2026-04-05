/**
 * API: GET/POST/DELETE /api/teacher/availability
 *
 * GET    — list teacher's own unavailability blocks
 * POST   — create a new unavailability block
 * DELETE — remove a block by id (?id=xxx)
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { queryDocs, createDoc, deleteDoc, nowISO } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';
import { writeAuditLog, extractRequestMeta } from '@/services/audit/log';
import { z } from 'zod';

const CreateBlockSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be YYYY-MM-DD'),
  endDate:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'endDate must be YYYY-MM-DD'),
  reason:    z.string().min(1).max(200),
  notes:     z.string().max(500).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['teacher', 'super_admin']);

    const teacherId = auth.role === 'super_admin'
      ? (new URL(request.url).searchParams.get('teacherId') ?? auth.uid)
      : auth.uid;

    const blocks = await queryDocs<Record<string, unknown>>(
      COLLECTIONS.TEACHER_AVAILABILITY_BLOCKS,
      [{ type: 'where', field: 'teacherId', op: '==', value: teacherId }]
    );

    // Sort by startDate descending client-side
    blocks.sort((a, b) =>
      String(b.startDate ?? '').localeCompare(String(a.startDate ?? ''))
    );

    return Response.json({ success: true, blocks });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['teacher', 'super_admin']);
    const body = await request.json();
    const parsed = CreateBlockSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const { startDate, endDate, reason, notes } = parsed.data;

    if (endDate < startDate) {
      return Response.json({ error: 'endDate must be on or after startDate' }, { status: 400 });
    }

    const id = await createDoc(COLLECTIONS.TEACHER_AVAILABILITY_BLOCKS, {
      teacherId: auth.uid,
      startDate,
      endDate,
      reason,
      notes: notes ?? null,
      createdBy: auth.uid,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    });

    const { ipAddress, userAgent } = extractRequestMeta(request);
    await writeAuditLog({
      actorId: auth.uid,
      actorRole: auth.role,
      action: 'CLASS_INSTANCE_UPDATED', // closest available — marks teacher unavailability
      entityType: 'teacher_availability_block',
      entityId: id,
      newState: { teacherId: auth.uid, startDate, endDate, reason },
      ipAddress,
      userAgent,
    });

    return Response.json({ success: true, id }, { status: 201 });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['teacher', 'super_admin']);
    const id = new URL(request.url).searchParams.get('id');

    if (!id) {
      return Response.json({ error: 'id query param required' }, { status: 400 });
    }

    await deleteDoc(COLLECTIONS.TEACHER_AVAILABILITY_BLOCKS, id);

    return Response.json({ success: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}
