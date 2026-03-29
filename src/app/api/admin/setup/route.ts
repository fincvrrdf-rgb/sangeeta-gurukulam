/**
 * API: POST /api/admin/setup
 *
 * One-time setup endpoint to create the first super_admin.
 * Only works if no super_admin exists yet. After the first admin
 * is created, this endpoint permanently returns 403.
 */

import { NextRequest } from 'next/server';
import { adminAuth } from '@/lib/firebase/admin';
import { adminDb } from '@/lib/firebase/admin';
import { setDoc, nowISO } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';

const SUPER_ADMIN_EMAIL = 'sangeetagurukulam0@gmail.com';

export async function POST(request: NextRequest) {
  try {
    // Check if any super_admin already exists
    const usersSnap = await adminDb.collection(COLLECTIONS.USERS)
      .where('role', '==', 'super_admin')
      .limit(1)
      .get();

    if (!usersSnap.empty) {
      return Response.json({ error: 'Super admin already exists. Setup is locked.' }, { status: 403 });
    }

    // Find the user by email
    let firebaseUser;
    try {
      firebaseUser = await adminAuth.getUserByEmail(SUPER_ADMIN_EMAIL);
    } catch {
      return Response.json({
        error: `No Firebase Auth account found for ${SUPER_ADMIN_EMAIL}. Please register first, then run setup.`
      }, { status: 404 });
    }

    // Set custom claim
    await adminAuth.setCustomUserClaims(firebaseUser.uid, { role: 'super_admin' });

    // Create/update user document
    await setDoc(COLLECTIONS.USERS, firebaseUser.uid, {
      id: firebaseUser.uid,
      email: SUPER_ADMIN_EMAIL,
      displayName: firebaseUser.displayName || 'Super Admin',
      role: 'super_admin',
      isActive: true,
      consentRecordings: false,
      consentRecordingsTimestamp: null,
      consentNotifications: true,
      privacyPolicyAcceptedAt: null,
      termsAcceptedAt: null,
      timezone: 'Asia/Kolkata',
      locale: 'en-IN',
      createdAt: nowISO(),
      updatedAt: nowISO(),
    });

    return Response.json({
      success: true,
      message: `${SUPER_ADMIN_EMAIL} is now super_admin. Sign out and sign back in to activate.`,
      uid: firebaseUser.uid,
    });
  } catch (error) {
    console.error('[SETUP_ERROR]', error);
    const message = error instanceof Error ? error.message : 'Setup failed';
    return Response.json({ error: message }, { status: 500 });
  }
}
