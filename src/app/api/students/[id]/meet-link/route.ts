/**
 * API: PUT /api/students/[id]/meet-link  { meetLink: string }
 *
 * Set the student's personal Google Meet link, used for their own classes.
 * An empty string clears it (their classes fall back to the batch link).
 * Teacher / admin only.
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { getDoc, updateDoc, nowISO } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';
import { normaliseMeetLink } from '@/lib/classes/links';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const Schema = z.object({ meetLink: z.string().max(300) });

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAuth(request, ['teacher', 'super_admin']);
    const parsed = Schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return Response.json({ error: 'Invalid link' }, { status: 400 });

    const link = normaliseMeetLink(parsed.data.meetLink);
    if (link && !/^https:\/\/[\w.-]+\.[a-z]{2,}\//i.test(link)) {
      return Response.json({ error: 'That does not look like a link' }, { status: 400 });
    }
    if (!(await getDoc(COLLECTIONS.STUDENT_PROFILES, params.id))) {
      return Response.json({ error: 'Student not found' }, { status: 404 });
    }
    await updateDoc(COLLECTIONS.STUDENT_PROFILES, params.id, { meetLink: link || null, updatedAt: nowISO() });
    return Response.json({ success: true, meetLink: link || null });
  } catch (error) {
    return authErrorResponse(error);
  }
}
