/**
 * API: GET/POST /api/lyrics
 *
 * GET  — List lyrics. Students see only published; teachers see all.
 * POST — Teacher creates a new lyrics entry.
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { createDoc, queryDocs, nowISO } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';
import { snapshotLyricsVersion } from '@/services/lyrics/versions';
import { writeAuditLog, extractRequestMeta } from '@/services/audit/log';
import type { Lyrics } from '@/domain/types';
import { z } from 'zod';

const CreateLyricsSchema = z.object({
  title: z.string().min(1),
  teachingUnitId: z.string().optional(),
  ragam: z.string().optional(),
  taalam: z.string().optional(),
  originalText: z.string().min(1),
  transliteration: z.string().optional(),
  translation: z.string().optional(),
  meaning: z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request, []);

    const isTeacherOrAdmin = auth.role === 'teacher' || auth.role === 'super_admin';

    const constraints = isTeacherOrAdmin
      ? [
          { type: 'orderBy' as const, field: 'createdAt', direction: 'desc' as const },
          { type: 'limit' as const, value: 50 },
        ]
      : [
          { type: 'where' as const, field: 'verificationStatus', op: '==' as const, value: 'published' },
          { type: 'orderBy' as const, field: 'createdAt', direction: 'desc' as const },
          { type: 'limit' as const, value: 50 },
        ];

    const lyrics = await queryDocs<Lyrics>(COLLECTIONS.LYRICS, constraints);

    return Response.json({ lyrics });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['teacher', 'super_admin']);
    const body = await request.json();
    const parsed = CreateLyricsSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const { title, teachingUnitId, ragam, taalam, originalText, transliteration, translation, meaning } = parsed.data;

    const lyricsId = await createDoc(COLLECTIONS.LYRICS, {
      title,
      composer: null,
      deity: null,
      devotionalCategory: null,
      ragam: ragam ?? null,
      taalam: taalam ?? null,
      originalLanguage: 'sa',
      sourceText: originalText,
      transliteration: transliteration ?? '',
      translations: translation ? { en: { text: translation, translatedBy: auth.uid, source: 'manual' } } : {},
      notes: '',
      meaning: meaning ?? '',
      sourceReference: '',
      sourceLink: null,
      attachedFiles: [],
      verificationStatus: 'draft',
      publishedAt: null,
      publishedBy: null,
      verifiedBy: null,
      linkedLessonIds: [],
      linkedTeachingUnitIds: teachingUnitId ? [teachingUnitId] : [],
      createdBy: auth.uid,
    });

    const { ipAddress, userAgent } = extractRequestMeta(request);
    await writeAuditLog({
      actorId: auth.uid,
      actorRole: auth.role,
      action: 'LYRICS_CREATED',
      entityType: 'lyrics',
      entityId: lyricsId,
      newState: { title },
      ipAddress,
      userAgent,
    });

    return Response.json({ success: true, id: lyricsId }, { status: 201 });
  } catch (error) {
    return authErrorResponse(error);
  }
}
