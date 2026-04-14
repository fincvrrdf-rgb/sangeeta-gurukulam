/**
 * API: GET/PATCH /api/lyrics/[id]
 *
 * GET   — Get lyrics by ID. Students can only see published lyrics.
 * PATCH — Teacher updates lyrics. Snapshots the previous version first.
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { getDoc, updateDoc, deleteDoc, nowISO } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';
import { snapshotLyricsVersion } from '@/services/lyrics/versions';
import { writeAuditLog, extractRequestMeta } from '@/services/audit/log';
import type { Lyrics } from '@/domain/types';
import { z } from 'zod';

const AttachedFileSchema = z.object({
  name: z.string(),
  storageRef: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number(),
  uploadedAt: z.string(),
});

const UpdateLyricsSchema = z.object({
  title: z.string().min(1).optional(),
  ragam: z.string().optional(),
  taalam: z.string().optional(),
  originalText: z.string().optional(),
  transliteration: z.string().optional(),
  translation: z.string().optional(),
  meaning: z.string().optional(),
  notes: z.string().optional(),
  appendAttachedFile: AttachedFileSchema.optional(),
  removeAttachedFile: z.string().optional(), // storageRef to remove
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request, []);
    const { id } = await params;

    const lyrics = await getDoc<Lyrics>(COLLECTIONS.LYRICS, id);
    if (!lyrics) {
      return Response.json({ error: 'Lyrics not found' }, { status: 404 });
    }

    const isTeacherOrAdmin = auth.role === 'teacher' || auth.role === 'super_admin';
    if (!isTeacherOrAdmin && lyrics.verificationStatus !== 'published') {
      return Response.json({ error: 'Lyrics not found' }, { status: 404 });
    }

    return Response.json({ lyrics });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request, ['teacher', 'super_admin']);
    const { id } = await params;
    const body = await request.json();
    const parsed = UpdateLyricsSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const existing = await getDoc<Lyrics>(COLLECTIONS.LYRICS, id);
    if (!existing) {
      return Response.json({ error: 'Lyrics not found' }, { status: 404 });
    }

    // Snapshot current version (non-blocking — missing index won't fail the save)
    snapshotLyricsVersion(id, existing, auth.uid, 'Manual edit').catch(() => {});

    const updates: Record<string, unknown> = {};
    if (parsed.data.title !== undefined) updates.title = parsed.data.title;
    if (parsed.data.ragam !== undefined) updates.ragam = parsed.data.ragam;
    if (parsed.data.taalam !== undefined) updates.taalam = parsed.data.taalam;
    if (parsed.data.originalText !== undefined) updates.sourceText = parsed.data.originalText;
    if (parsed.data.transliteration !== undefined) updates.transliteration = parsed.data.transliteration;
    if (parsed.data.meaning !== undefined) updates.meaning = parsed.data.meaning;
    if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes;
    if (parsed.data.translation !== undefined) {
      updates.translations = {
        ...existing.translations,
        en: { text: parsed.data.translation, translatedBy: auth.uid, source: 'manual' },
      };
    }

    if (parsed.data.appendAttachedFile) {
      const current = (existing.attachedFiles ?? []) as unknown[];
      updates.attachedFiles = [...current, parsed.data.appendAttachedFile];
      // Auto-publish so students can see the file immediately
      if (existing.verificationStatus !== 'published') {
        updates.verificationStatus = 'published';
        updates.publishedAt = nowISO();
        updates.publishedBy = auth.uid;
      }
    }
    if (parsed.data.removeAttachedFile) {
      const current = (existing.attachedFiles ?? []) as Array<{ storageRef: string }>;
      updates.attachedFiles = current.filter(
        (f) => f.storageRef !== parsed.data.removeAttachedFile
      );
    }

    await updateDoc(COLLECTIONS.LYRICS, id, updates);

    const { ipAddress, userAgent } = extractRequestMeta(request);
    await writeAuditLog({
      actorId: auth.uid,
      actorRole: auth.role,
      action: 'LYRICS_UPDATED',
      entityType: 'lyrics',
      entityId: id,
      previousState: { title: existing.title, verificationStatus: existing.verificationStatus },
      newState: updates,
      ipAddress,
      userAgent,
    });

    return Response.json({ success: true, id });
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

    const existing = await getDoc<Lyrics>(COLLECTIONS.LYRICS, id);
    if (!existing) {
      return Response.json({ error: 'Lyrics not found' }, { status: 404 });
    }

    await deleteDoc(COLLECTIONS.LYRICS, id);

    const { ipAddress, userAgent } = extractRequestMeta(request);
    await writeAuditLog({
      actorId: auth.uid,
      actorRole: auth.role,
      action: 'LYRICS_DELETED',
      entityType: 'lyrics',
      entityId: id,
      previousState: { title: existing.title },
      newState: null,
      ipAddress,
      userAgent,
    });

    return Response.json({ success: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}
