/**
 * API: POST /api/admin/syllabus/seed
 *
 * Seeds the full Ganamrutha Bodhini syllabus into Firestore.
 * Idempotent — skips items that already exist.
 * super_admin only.
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { queryDocs, createDoc, nowISO } from '@/lib/firebase/firestore';
import { COLLECTIONS, GANAMRUTHA_BODHINI_LESSONS, GANAMRUTHA_BODHINI_COPYRIGHT, INITIAL_GEETHAMS, INITIAL_SWARAJATHIS } from '@/domain/constants';
import { writeAuditLog, extractRequestMeta } from '@/services/audit/log';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['super_admin']);

    // ── 1. Ensure book exists ───────────────────────────────────────────────
    const existingBooks = await queryDocs<Record<string, unknown>>(COLLECTIONS.SYLLABUS_BOOKS, [
      { type: 'where', field: 'title', op: '==', value: 'Ganamrutha Bodhini' },
    ]);

    let bookId: string;
    if (existingBooks.length === 0) {
      bookId = await createDoc(COLLECTIONS.SYLLABUS_BOOKS, {
        title: GANAMRUTHA_BODHINI_COPYRIGHT.title,
        authorName: GANAMRUTHA_BODHINI_COPYRIGHT.author,
        publisherName: GANAMRUTHA_BODHINI_COPYRIGHT.publisher,
        edition: GANAMRUTHA_BODHINI_COPYRIGHT.edition,
        amazonUrl: GANAMRUTHA_BODHINI_COPYRIGHT.amazonUrl,
        teacherSummary:
          'Foundation syllabus (Sangeetha Bala Padam) for Carnatic vocal music — ' +
          'Swaravali Varisaigal, Jantai Varisaigal, Dhattu Varisaigal, Alankarams, ' +
          '13 Geethams, 2 Swarajathis, 5 Varnams.',
        isActive: true,
        licenseStatus: 'teacher_authored_only',
        copyrightNotice: GANAMRUTHA_BODHINI_COPYRIGHT.notice,
        createdBy: auth.uid,
        createdAt: nowISO(),
        updatedAt: nowISO(),
      });
    } else {
      bookId = existingBooks[0].id as string;
    }

    // ── 2. Seed lessons ─────────────────────────────────────────────────────
    const existingLessons = await queryDocs<Record<string, unknown>>(COLLECTIONS.SYLLABUS_LESSONS, [
      { type: 'where', field: 'bookId', op: '==', value: bookId },
    ]);
    const existingLessonNumbers = new Set(existingLessons.map((l) => l.lessonNumber as number));
    const lessonIds: Record<number, string> = {};

    // Map existing lesson IDs
    for (const l of existingLessons) {
      lessonIds[l.lessonNumber as number] = l.id as string;
    }

    let lessonsCreated = 0;
    for (const lesson of GANAMRUTHA_BODHINI_LESSONS) {
      if (existingLessonNumbers.has(lesson.lessonNumber)) continue;
      const id = await createDoc(COLLECTIONS.SYLLABUS_LESSONS, {
        bookId,
        lessonNumber: lesson.lessonNumber,
        lessonName: lesson.lessonName,
        description: lesson.ragam ? `Ragam: ${lesson.ragam} · Taalam: ${lesson.taalam}` : '',
        isContainer: lesson.isContainer,
        order: lesson.lessonNumber,
        batchBandCode: lesson.batchBandCode,
        isActive: true,
        createdBy: auth.uid,
        createdAt: nowISO(),
        updatedAt: nowISO(),
      });
      lessonIds[lesson.lessonNumber] = id;
      lessonsCreated++;
    }

    // ── 3. Seed teaching units ──────────────────────────────────────────────
    const existingUnits = await queryDocs<Record<string, unknown>>(COLLECTIONS.TEACHING_UNITS, [
      { type: 'where', field: 'bookId', op: '==', value: bookId },
    ]);
    const existingUnitKeys = new Set(
      existingUnits.map((u) => `${u.lessonId}|${u.unitNumber}`)
    );

    let unitsCreated = 0;

    // Lessons 1–4: single teaching unit each (the lesson itself)
    for (const lesson of GANAMRUTHA_BODHINI_LESSONS.filter((l) => !l.isContainer)) {
      const lessonId = lessonIds[lesson.lessonNumber];
      if (!lessonId) continue;
      const key = `${lessonId}|1`;
      if (existingUnitKeys.has(key)) continue;
      await createDoc(COLLECTIONS.TEACHING_UNITS, {
        lessonId,
        bookId,
        unitType: lesson.lessonNumber <= 2 ? 'swaravali' : 'exercise',
        unitName: lesson.lessonName,
        unitNumber: 1,
        description: '',
        ragam: lesson.ragam ?? null,
        taalam: lesson.taalam ?? null,
        composer: null,
        estimatedClassCount: lesson.lessonNumber <= 2 ? 8 : 6,
        lyricsId: null,
        order: 1,
        isActive: true,
        createdBy: auth.uid,
        createdAt: nowISO(),
        updatedAt: nowISO(),
      });
      unitsCreated++;
    }

    // Lesson 5: Geethams
    const lesson5Id = lessonIds[5];
    if (lesson5Id) {
      for (const g of INITIAL_GEETHAMS) {
        const key = `${lesson5Id}|${g.unitNumber}`;
        if (existingUnitKeys.has(key)) continue;
        await createDoc(COLLECTIONS.TEACHING_UNITS, {
          lessonId: lesson5Id,
          bookId,
          unitType: 'geetham',
          unitName: g.unitName,
          unitNumber: g.unitNumber,
          description: '',
          ragam: g.ragam,
          taalam: g.taalam,
          composer: null,
          estimatedClassCount: g.estimatedClassCount,
          lyricsId: null,
          order: g.unitNumber,
          isActive: true,
          createdBy: auth.uid,
          createdAt: nowISO(),
          updatedAt: nowISO(),
        });
        unitsCreated++;
      }
    }

    // Lesson 6: Swarajathis
    const lesson6Id = lessonIds[6];
    if (lesson6Id) {
      for (const s of INITIAL_SWARAJATHIS) {
        const key = `${lesson6Id}|${s.unitNumber}`;
        if (existingUnitKeys.has(key)) continue;
        await createDoc(COLLECTIONS.TEACHING_UNITS, {
          lessonId: lesson6Id,
          bookId,
          unitType: 'swarajathi',
          unitName: s.unitName,
          unitNumber: s.unitNumber,
          description: '',
          ragam: s.ragam,
          taalam: s.taalam,
          composer: null,
          estimatedClassCount: s.estimatedClassCount,
          lyricsId: null,
          order: s.unitNumber,
          isActive: true,
          createdBy: auth.uid,
          createdAt: nowISO(),
          updatedAt: nowISO(),
        });
        unitsCreated++;
      }
    }

    // Varnams are in Book 2 — not seeded here.

    const { ipAddress, userAgent } = extractRequestMeta(request);
    await writeAuditLog({
      actorId: auth.uid,
      actorRole: auth.role,
      action: 'SYLLABUS_ITEM_CREATED',
      entityType: 'syllabus_book',
      entityId: bookId,
      newState: { bookId, lessonsCreated, unitsCreated },
      ipAddress,
      userAgent,
    });

    return Response.json({
      success: true,
      bookId,
      lessonsCreated,
      unitsCreated,
      message: `Syllabus seeded: ${lessonsCreated} lessons and ${unitsCreated} teaching units created.`,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
