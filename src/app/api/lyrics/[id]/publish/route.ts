/**
 * API: POST /api/lyrics/[id]/publish
 *
 * Teacher publishes lyrics, making them visible to students.
 * Sets verificationStatus to 'published' and records publishedAt.
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { getDoc, updateDoc, nowISO } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';
import { writeAuditLog, extractRequestMeta } from '@/services/audit/log';
import type { Lyrics } from '@/domain/types';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request, ['teacher', 'super_admin']);
    const { id } = await params;

    const lyrics = await getDoc<Lyrics>(COLLECTIONS.LYRICS, id);
    if (!lyrics) {
      return Response.json({ error: 'Lyrics not found' }, { status: 404 });
    }

    if (lyrics.verificationStatus === 'published') {
      return Response.json({ error: 'Lyrics are already published' }, { status: 400 });
    }

    const now = nowISO();
    await updateDoc(COLLECTIONS.LYRICS, id, {
      verificationStatus: 'published',
      publishedAt: now,
      publishedBy: auth.uid,
    });

    const { ipAddress, userAgent } = extractRequestMeta(request);
    await writeAuditLog({
      actorId: auth.uid,
      actorRole: auth.role,
      action: 'LYRICS_PUBLISHED',
      entityType: 'lyrics',
      entityId: id,
      previousState: { verificationStatus: lyrics.verificationStatus },
      newState: { verificationStatus: 'published', publishedAt: now },
      ipAddress,
      userAgent,
    });

    return Response.json({ success: true, id, publishedAt: now });
  } catch (error) {
    return authErrorResponse(error);
  }
}
