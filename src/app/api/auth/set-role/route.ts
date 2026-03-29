/**
 * API: POST /api/auth/set-role
 *
 * Sets the Firebase custom claim for a user's role.
 * Called after registration or by Super Admin when changing roles.
 *
 * Security: Only super_admin can set roles for other users.
 * On first registration (no existing role), a limited self-assignment is allowed.
 */

import { NextRequest } from 'next/server';
import { adminAuth } from '@/lib/firebase/admin';
import { setDoc, getDoc, nowISO } from '@/lib/firebase/firestore';
import { requireAuth, authErrorResponse, AuthError } from '@/lib/auth/middleware';
import { writeAuditLog, extractRequestMeta } from '@/services/audit/log';
import { COLLECTIONS } from '@/domain/constants';
import type { UserRole } from '@/domain/enums';
import { z } from 'zod';

const SetRoleSchema = z.object({
  targetUserId: z.string().min(1),
  role: z.enum(['super_admin', 'teacher', 'student']),
  displayName: z.string().min(1).optional(),
  email: z.string().email().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = SetRoleSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const { targetUserId, role, displayName, email } = parsed.data;

    // Check if this is a self-registration (first-time role assignment)
    const authHeader = request.headers.get('Authorization');
    let callerUid: string;
    let callerRole: UserRole | null = null;

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const decoded = await adminAuth.verifyIdToken(token);
      callerUid = decoded.uid;
      callerRole = (decoded.role as UserRole) || null;
    } else {
      return Response.json({ error: 'Missing Authorization header' }, { status: 401 });
    }

    // Authorization rules:
    // 1. Super admin can set any role for any user
    // 2. A user with no role can set their own role to 'student' only (self-registration)
    if (callerRole === 'super_admin') {
      // Allowed — admin can do anything
    } else if (!callerRole && callerUid === targetUserId && role === 'student') {
      // Self-registration as student — allowed
    } else {
      throw new AuthError(403, 'Only Super Admin can assign roles.');
    }

    // Set custom claim
    await adminAuth.setCustomUserClaims(targetUserId, { role });

    // Create or update user document
    const existingUser = await getDoc(COLLECTIONS.USERS, targetUserId);
    const firebaseUser = await adminAuth.getUser(targetUserId);

    await setDoc(COLLECTIONS.USERS, targetUserId, {
      id: targetUserId,
      email: email || firebaseUser.email || '',
      displayName: displayName || firebaseUser.displayName || '',
      role,
      isActive: true,
      consentRecordings: false,
      consentRecordingsTimestamp: null,
      consentNotifications: true,
      privacyPolicyAcceptedAt: null,
      termsAcceptedAt: null,
      timezone: 'Asia/Kolkata',
      locale: 'en-IN',
      createdAt: existingUser ? (existingUser as Record<string, unknown>).createdAt as string : nowISO(),
      updatedAt: nowISO(),
    });

    // Create role-specific profile
    if (role === 'student') {
      const existingProfile = await getDoc(COLLECTIONS.STUDENT_PROFILES, targetUserId);
      if (!existingProfile) {
        await setDoc(COLLECTIONS.STUDENT_PROFILES, targetUserId, {
          userId: targetUserId,
          fullName: displayName || firebaseUser.displayName || '',
          phone: '',
          guardianName: null,
          guardianPhone: null,
          guardianEmail: null,
          isMinor: false,
          guardianConsentGiven: false,
          guardianConsentTimestamp: null,
          primaryTeacherId: '',
          enrollmentDate: nowISO(),
          countryCode: 'IN',
          billingRegion: 'india',
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
          updatedAt: nowISO(),
        });
      }
    } else if (role === 'teacher') {
      const existingProfile = await getDoc(COLLECTIONS.TEACHER_PROFILES, targetUserId);
      if (!existingProfile) {
        await setDoc(COLLECTIONS.TEACHER_PROFILES, targetUserId, {
          userId: targetUserId,
          fullName: displayName || firebaseUser.displayName || '',
          phone: '',
          bio: '',
          defaultTimezone: 'Asia/Kolkata',
          googleCalendarConnected: false,
          googleCalendarEmail: null,
          googleOAuthTokenRef: null,
          assignedBatchBandIds: [],
          isActive: true,
          createdAt: nowISO(),
          updatedAt: nowISO(),
        });
      }
    }

    // Audit log
    const { ipAddress, userAgent } = extractRequestMeta(request);
    await writeAuditLog({
      actorId: callerUid,
      actorRole: callerRole || role,
      action: 'USER_ROLE_CHANGED',
      entityType: 'user',
      entityId: targetUserId,
      newState: { role },
      ipAddress,
      userAgent,
    });

    return Response.json({ success: true, role });
  } catch (error) {
    return authErrorResponse(error);
  }
}
