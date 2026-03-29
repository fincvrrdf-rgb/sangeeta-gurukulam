/**
 * API: /api/admin/students
 *
 * GET  — List all student profiles (super_admin only)
 * POST — Create a new student by email (super_admin only)
 */

import { NextRequest } from 'next/server';
import { adminAuth } from '@/lib/firebase/admin';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { queryDocs, setDoc, getDoc, nowISO } from '@/lib/firebase/firestore';
import { writeAuditLog, extractRequestMeta } from '@/services/audit/log';
import { COLLECTIONS } from '@/domain/constants';
import { z } from 'zod';

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request, ['super_admin']);

    const students = await queryDocs<Record<string, unknown>>(COLLECTIONS.STUDENT_PROFILES, [
      { type: 'orderBy', field: 'createdAt', direction: 'desc' },
    ]);

    // Build email map
    const emailMap: Record<string, string> = {};
    for (const s of students) {
      try {
        const fbUser = await adminAuth.getUser(s.userId as string);
        emailMap[s.userId as string] = fbUser.email || '';
      } catch { /* skip */ }
    }

    return Response.json({ students, emailMap });
  } catch (error) {
    return authErrorResponse(error);
  }
}

const AddStudentSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1),
  phone: z.string().optional(),
  guardianName: z.string().optional(),
  billingRegion: z.enum(['india', 'international']).default('india'),
});

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['super_admin']);
    const body = await request.json();
    const parsed = AddStudentSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const { email, displayName, phone, guardianName, billingRegion } = parsed.data;

    // Check if user exists in Firebase Auth, create if not
    let firebaseUser;
    try {
      firebaseUser = await adminAuth.getUserByEmail(email);
    } catch {
      firebaseUser = await adminAuth.createUser({
        email,
        displayName,
        emailVerified: true,
      });
    }

    // Set custom claim to student
    await adminAuth.setCustomUserClaims(firebaseUser.uid, { role: 'student' });

    // Create user document
    const existingUser = await getDoc(COLLECTIONS.USERS, firebaseUser.uid);
    await setDoc(COLLECTIONS.USERS, firebaseUser.uid, {
      id: firebaseUser.uid,
      email,
      displayName,
      role: 'student',
      isActive: true,
      consentRecordings: false,
      consentRecordingsTimestamp: null,
      consentNotifications: true,
      privacyPolicyAcceptedAt: null,
      termsAcceptedAt: null,
      timezone: 'Asia/Kolkata',
      locale: 'en-IN',
      createdAt: existingUser ? (existingUser as Record<string, unknown>).createdAt as string : nowISO(),
    });

    // Create student profile
    const existingProfile = await getDoc(COLLECTIONS.STUDENT_PROFILES, firebaseUser.uid);
    if (!existingProfile) {
      await setDoc(COLLECTIONS.STUDENT_PROFILES, firebaseUser.uid, {
        userId: firebaseUser.uid,
        fullName: displayName,
        phone: phone || '',
        guardianName: guardianName || null,
        guardianPhone: null,
        guardianEmail: null,
        isMinor: false,
        guardianConsentGiven: false,
        guardianConsentTimestamp: null,
        primaryTeacherId: '',
        enrollmentDate: nowISO(),
        countryCode: billingRegion === 'india' ? 'IN' : '',
        billingRegion,
        currentLessonId: '',
        currentTeachingUnitId: '',
        currentMasteryStage: 'introduced',
        currentBatchBandId: '',
        consecutiveViolationCount: 0,
        isPaymentCompulsoryThisCycle: false,
        paymentCompulsoryTriggeredAt: null,
        paymentCompulsoryReason: null,
        longAbsenceActive: false,
        onboardingComplete: false,
        placementNotes: '',
        createdAt: nowISO(),
      });
    }

    const { ipAddress, userAgent } = extractRequestMeta(request);
    await writeAuditLog({
      actorId: auth.uid,
      actorRole: auth.role,
      action: 'STUDENT_ONBOARDED',
      entityType: 'student_profile',
      entityId: firebaseUser.uid,
      newState: { email, displayName, billingRegion },
      ipAddress,
      userAgent,
    });

    return Response.json({ success: true, uid: firebaseUser.uid });
  } catch (error) {
    return authErrorResponse(error);
  }
}
