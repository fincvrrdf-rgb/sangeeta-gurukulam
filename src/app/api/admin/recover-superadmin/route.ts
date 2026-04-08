/**
 * API: POST /api/admin/recover-superadmin
 *
 * Emergency recovery endpoint: re-enables the hardcoded super admin
 * Firebase Auth account if it was accidentally disabled.
 * No auth required (needed when locked out).
 */

import { adminAuth } from '@/lib/firebase/admin';
import { updateDoc, nowISO } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';

const SUPER_ADMIN_EMAIL = 'sangeetagurukulam0@gmail.com';

export async function POST() {
  try {
    const firebaseUser = await adminAuth.getUserByEmail(SUPER_ADMIN_EMAIL);

    // Re-enable the account
    await adminAuth.updateUser(firebaseUser.uid, { disabled: false });

    // Restore custom claim just in case
    await adminAuth.setCustomUserClaims(firebaseUser.uid, { role: 'super_admin' });

    // Restore isActive in Firestore
    await updateDoc(COLLECTIONS.USERS, firebaseUser.uid, {
      isActive: true,
      role: 'super_admin',
      updatedAt: nowISO(),
    });

    return Response.json({
      success: true,
      message: 'Super admin account re-enabled. Please sign in now.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Recovery failed';
    return Response.json({ error: message }, { status: 500 });
  }
}
