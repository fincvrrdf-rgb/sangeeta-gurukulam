/**
 * Seed script — run once after deploy to populate Firestore with:
 *   1. App settings (defaults)
 *   2. Ganamrutha Bodhini book + lessons + teaching units
 *   3. Batch bands + eligibility rules
 *   4. Default assessment rubric
 *
 * Usage: npm run seed
 * Requires: FIREBASE_ADMIN_* env vars set in .env.local
 *
 * This script is idempotent — it checks for existing data before writing.
 */

import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import {
  DEFAULT_APP_SETTINGS,
  GANAMRUTHA_BODHINI_LESSONS,
  INITIAL_GEETHAMS,
  BATCH_BAND_DEFINITIONS,
  DEFAULT_RUBRIC_DIMENSIONS,
  COLLECTIONS,
} from '../../../domain/constants';

// Initialize Firebase Admin
if (getApps().length === 0) {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    console.error('ERROR: Firebase Admin env vars not set. See .env.local.example');
    process.exit(1);
  }

  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

const db = getFirestore();
const now = new Date().toISOString();

async function seed() {
  console.log('Seeding Sangeeta Gurukulam Firestore...\n');

  // 1. App Settings
  const settingsRef = db.collection(COLLECTIONS.APP_SETTINGS).doc('global');
  const settingsSnap = await settingsRef.get();
  if (!settingsSnap.exists) {
    await settingsRef.set({ ...DEFAULT_APP_SETTINGS, updatedAt: now, updatedBy: 'seed_script' });
    console.log('  [+] App settings created');
  } else {
    console.log('  [=] App settings already exist (skipped)');
  }

  // 2. Syllabus Book
  const booksRef = db.collection(COLLECTIONS.SYLLABUS_BOOKS);
  const existingBooks = await booksRef.where('title', '==', 'Ganamrutha Bodhini').get();
  let bookId: string;

  if (existingBooks.empty) {
    const bookDoc = await booksRef.add({
      title: 'Ganamrutha Bodhini',
      authorName: 'A.S. Panchapakesa Iyer',
      publisherName: 'Ganamrutha Prachuram, Chennai',
      edition: 'August 2015',
      teacherSummary: 'Foundation syllabus (Sangeetha Bala Padam) for Carnatic vocal music — covers swaravali varisaigal, jantai varisaigal, dhattu varisaigal, upper sthayi, 13 geethams, swarajathis, alankaras, and notes in various ragams.',
      isActive: true,
      licenseStatus: 'teacher_authored_only',
      copyrightNotes: 'App stores teacher-authored metadata only. No reproduction of book pages.',
      createdAt: now,
      updatedBy: 'seed_script',
      updatedAt: now,
    });
    bookId = bookDoc.id;
    console.log(`  [+] Book created: Ganamrutha Bodhini (${bookId})`);
  } else {
    bookId = existingBooks.docs[0].id;
    console.log(`  [=] Book already exists: ${bookId}`);
  }

  // 3. Lessons
  const lessonsRef = db.collection(COLLECTIONS.SYLLABUS_LESSONS);
  const lessonIds: Record<number, string> = {};

  for (const lesson of GANAMRUTHA_BODHINI_LESSONS) {
    const existing = await lessonsRef
      .where('bookId', '==', bookId)
      .where('lessonNumber', '==', lesson.lessonNumber)
      .get();

    if (existing.empty) {
      const doc = await lessonsRef.add({
        bookId,
        lessonNumber: lesson.lessonNumber,
        lessonName: lesson.lessonName,
        description: lesson.ragam ? `Ragam: ${lesson.ragam}` : '',
        isContainer: lesson.isContainer,
        order: lesson.lessonNumber,
        batchBandCode: lesson.batchBandCode,
        isActive: true,
        createdBy: 'seed_script',
        createdAt: now,
        updatedAt: now,
      });
      lessonIds[lesson.lessonNumber] = doc.id;
      console.log(`  [+] Lesson ${lesson.lessonNumber}: ${lesson.lessonName} (${doc.id})`);
    } else {
      lessonIds[lesson.lessonNumber] = existing.docs[0].id;
      console.log(`  [=] Lesson ${lesson.lessonNumber} already exists`);
    }
  }

  // 4. Teaching Units (for non-container lessons + Geethams)
  const unitsRef = db.collection(COLLECTIONS.TEACHING_UNITS);

  // Non-container lessons (1–4): each lesson IS the teaching unit
  for (const lesson of GANAMRUTHA_BODHINI_LESSONS.filter(l => !l.isContainer)) {
    const lessonId = lessonIds[lesson.lessonNumber];
    const existing = await unitsRef
      .where('lessonId', '==', lessonId)
      .where('unitNumber', '==', 1)
      .get();

    if (existing.empty) {
      await unitsRef.add({
        lessonId,
        bookId,
        unitType: lesson.lessonNumber <= 2 ? 'swaravali' : 'exercise',
        unitName: lesson.lessonName,
        unitNumber: 1,
        description: '',
        ragam: lesson.ragam ?? null,
        taalam: lesson.taalam ?? null,
        composer: null,
        estimatedClassCount: 8,
        lyricsId: null,
        order: 1,
        isActive: true,
        createdBy: 'seed_script',
        createdAt: now,
        updatedAt: now,
      });
      console.log(`  [+] Unit: ${lesson.lessonName} (${lesson.ragam})`);
    }
  }

  // Geethams inside Lesson 5
  const lesson5Id = lessonIds[5];
  if (lesson5Id) {
    for (const geetham of INITIAL_GEETHAMS) {
      const existing = await unitsRef
        .where('lessonId', '==', lesson5Id)
        .where('unitNumber', '==', geetham.unitNumber)
        .get();

      if (existing.empty) {
        await unitsRef.add({
          lessonId: lesson5Id,
          bookId,
          unitType: 'geetham',
          unitName: geetham.unitName,
          unitNumber: geetham.unitNumber,
          description: '',
          ragam: geetham.ragam ?? null,
          taalam: geetham.taalam ?? null,
          composer: null,
          estimatedClassCount: 5,
          lyricsId: null,
          order: geetham.unitNumber,
          isActive: true,
          createdBy: 'seed_script',
          createdAt: now,
          updatedAt: now,
        });
        console.log(`  [+] Unit: ${geetham.unitName} — ${geetham.ragam} (inside Lesson 5)`);
      }
    }
  }

  // 5. Batch Bands
  const bandsRef = db.collection(COLLECTIONS.BATCH_BANDS);

  for (const band of BATCH_BAND_DEFINITIONS) {
    const existing = await bandsRef.where('code', '==', band.code).get();

    if (existing.empty) {
      await bandsRef.add({
        code: band.code,
        name: band.name,
        description: band.description,
        lessonIdFrom: lessonIds[band.lessonRange[0]] ?? '',
        lessonIdTo: lessonIds[band.lessonRange[1]] ?? '',
        teachingUnitScopeNote: (band as Record<string, unknown>).teachingUnitScope ?? null,
        assignedTeacherId: '',
        isActive: true,
        maxCapacityPerSlot: 10,
        createdAt: now,
        updatedAt: now,
      });
      console.log(`  [+] Batch Band ${band.code}: ${band.name}`);
    } else {
      console.log(`  [=] Batch Band ${band.code} already exists`);
    }
  }

  // 6. Default Assessment Rubric
  const rubricsRef = db.collection(COLLECTIONS.ASSESSMENT_RUBRICS);
  const existingRubrics = await rubricsRef.where('isDefault', '==', true).get();

  if (existingRubrics.empty) {
    await rubricsRef.add({
      name: 'Default Carnatic Rubric',
      dimensions: DEFAULT_RUBRIC_DIMENSIONS,
      applicableUnitTypes: ['exercise', 'geetham', 'varnam', 'kriti', 'swaravali'],
      isDefault: true,
      createdBy: 'seed_script',
      createdAt: now,
    });
    console.log('  [+] Default assessment rubric created');
  } else {
    console.log('  [=] Default rubric already exists');
  }

  console.log('\nSeed complete.');
}

seed().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
