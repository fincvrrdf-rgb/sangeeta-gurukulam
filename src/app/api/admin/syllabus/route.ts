/**
 * API: /api/admin/syllabus
 *
 * GET  — List all syllabus books, lessons, and teaching units (teacher/admin)
 * POST — Create or update a syllabus item (super_admin only)
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { createDoc, queryDocs, updateDoc, nowISO } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';
import { writeAuditLog, extractRequestMeta } from '@/services/audit/log';
import { z } from 'zod';

const SyllabusItemSchema = z.object({
  type: z.enum(['book', 'lesson', 'unit']),
  data: z.record(z.unknown()),
});

const COLLECTION_MAP: Record<string, string> = {
  book: COLLECTIONS.SYLLABUS_BOOKS,
  lesson: COLLECTIONS.SYLLABUS_LESSONS,
  unit: COLLECTIONS.TEACHING_UNITS,
};

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request, ['student', 'teacher', 'super_admin']);

    const [books, lessons, units] = await Promise.all([
      queryDocs(COLLECTIONS.SYLLABUS_BOOKS, []),
      queryDocs(COLLECTIONS.SYLLABUS_LESSONS, []),
      queryDocs(COLLECTIONS.TEACHING_UNITS, []),
    ]);

    return Response.json({ success: true, books, lessons, units });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['super_admin']);
    const body = await request.json();
    const parsed = SyllabusItemSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const { type, data } = parsed.data;
    const collection = COLLECTION_MAP[type];

    let itemId: string;

    if (data.id && typeof data.id === 'string') {
      // Update existing item
      const { id, ...rest } = data;
      await updateDoc(collection, id as string, { ...rest, updatedBy: auth.uid, updatedAt: nowISO() });
      itemId = id as string;
    } else {
      // Create new item
      itemId = await createDoc(collection, {
        ...data,
        createdBy: auth.uid,
        createdAt: nowISO(),
      });
    }

    const { ipAddress, userAgent } = extractRequestMeta(request);
    await writeAuditLog({
      actorId: auth.uid,
      actorRole: auth.role,
      action: data.id ? 'SYLLABUS_ITEM_UPDATED' : 'SYLLABUS_ITEM_CREATED',
      entityType: `syllabus_${type}`,
      entityId: itemId,
      newState: data as Record<string, unknown>,
      ipAddress,
      userAgent,
    });

    return Response.json({ success: true, itemId }, { status: data.id ? 200 : 201 });
  } catch (error) {
    return authErrorResponse(error);
  }
}
