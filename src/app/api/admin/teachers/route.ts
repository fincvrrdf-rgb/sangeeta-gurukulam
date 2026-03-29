/**
 * API: /api/admin/teachers
 *
 * GET   — List all teacher profiles (super_admin only)
 * POST  — Promote a user to teacher by email (super_admin only)
 * PATCH — Update teacher profile (batch assignments, active status)
 */

import { NextRequest } from 'next/server';
import { adminAuth } from '@/lib/firebase/admin';
import { adminDb } from '@/lib/firebase/admin';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { queryDocs, setDoc, updateDoc, getDoc, nowISO } from '@/lib/firebase/firestore';
import { writeAuditLog, extractRequestMeta } from '@/services/audit/log';
import { COLLECTIONS } from '@/domain/constants';
import { z } from 'zod';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['super_admin']);

    const teachers = await queryDocs<Record<string, unknown>>(COLLECTIONS.TEACHER_PROFILES, [
      { type: 'orderBy', field: 'createdAt', direction: 'desc' },
    ]);

    // Build email map from Firebase Auth
    const emailMap: Record<string, string> = {};
    for (const t of teachers) {
      try {
        const fbUser = await adminAuth.getUser(t.userId as string);
        emailMap[t.userId as string] = fbUser.email || '';
      } catch {
        // Skip if user not found
      }
    }

    return Response.json({ teachers, emailMap });
  } catch (error) {
    return authErrorResponse(error);
  }
}

const AddTeacherSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['super_admin']);
    const body = await request.json();
    const parsed = AddTeacherSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const { email, displayName } = parsed.data;

    // Check if user exists in Firebase Auth
    let firebaseUser;
    try {
      firebaseUser = await adminAuth.getUserByEmail(email);
    } catch {
      // User doesn't exist — create them
      firebaseUser = await adminAuth.createUser({
        email,
        displayName,
        emailVerified: true,
      });
    }

    // Set custom claim to teacher
    await adminAuth.setCustomUserClaims(firebaseUser.uid, { role: 'teacher' });

    // Create user document
    const existingUser = await getDoc(COLLECTIONS.USERS, firebaseUser.uid);
    await setDoc(COLLECTIONS.USERS, firebaseUser.uid, {
      id: firebaseUser.uid,
      email,
      displayName: displayName || firebaseUser.displayName || '',
      role: 'teacher',
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

    // Create teacher profile
    const existingProfile = await getDoc(COLLECTIONS.TEACHER_PROFILES, firebaseUser.uid);
    if (!existingProfile) {
      await setDoc(COLLECTIONS.TEACHER_PROFILES, firebaseUser.uid, {
        userId: firebaseUser.uid,
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
      });
    }

    // Audit
    const { ipAddress, userAgent } = extractRequestMeta(request);
    await writeAuditLog({
      actorId: auth.uid,
      actorRole: auth.role,
      action: 'USER_ROLE_CHANGED',
      entityType: 'user',
      entityId: firebaseUser.uid,
      newState: { role: 'teacher', email, displayName },
      ipAddress,
      userAgent,
    });

    return Response.json({ success: true, uid: firebaseUser.uid });
  } catch (error) {
    return authErrorResponse(error);
  }
}

const PatchTeacherSchema = z.object({
  userId: z.string().min(1),
  assignedBatchBandIds: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['super_admin']);
    const body = await request.json();
    const parsed = PatchTeacherSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const { userId, assignedBatchBandIds, isActive } = parsed.data;

    const updates: Record<string, unknown> = {};
    if (assignedBatchBandIds !== undefined) updates.assignedBatchBandIds = assignedBatchBandIds;
    if (isActive !== undefined) updates.isActive = isActive;

    await updateDoc(COLLECTIONS.TEACHER_PROFILES, userId, updates);

    const { ipAddress, userAgent } = extractRequestMeta(request);
    await writeAuditLog({
      actorId: auth.uid,
      actorRole: auth.role,
      action: 'USER_ROLE_CHANGED',
      entityType: 'teacher_profile',
      entityId: userId,
      newState: updates,
      ipAddress,
      userAgent,
    });

    return Response.json({ success: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}
