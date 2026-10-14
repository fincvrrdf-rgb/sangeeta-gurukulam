/**
 * API: GET/PUT /api/me/whatsapp
 *
 * The signed-in user's own WhatsApp number, used for the one-tap WhatsApp
 * links on recording and assessment notifications. Students store it on
 * their student profile, teachers on their teacher profile (the same `phone`
 * fields those links read).
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse, type AuthContext } from '@/lib/auth/middleware';
import { getDoc, queryDocs, updateDoc, nowISO } from '@/lib/firebase/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/domain/constants';
import { toWhatsAppNumber } from '@/lib/whatsapp';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

/** Student profile doc ID for this user (normally the UID itself). */
async function studentProfileId(uid: string): Promise<string | null> {
  if (await getDoc(COLLECTIONS.STUDENT_PROFILES, uid)) return uid;
  const found = await queryDocs<{ id: string }>(COLLECTIONS.STUDENT_PROFILES, [
    { type: 'where', field: 'userId', op: '==', value: uid },
  ]);
  return found[0]?.id ?? null;
}

async function readPhone(auth: AuthContext): Promise<string> {
  if (auth.role === 'student') {
    const id = await studentProfileId(auth.uid);
    const p = id ? await getDoc<Record<string, unknown>>(COLLECTIONS.STUDENT_PROFILES, id) : null;
    return (p?.phone as string) ?? '';
  }
  const p = await getDoc<Record<string, unknown>>(COLLECTIONS.TEACHER_PROFILES, auth.uid);
  return (p?.phone as string) ?? '';
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['student', 'teacher', 'super_admin']);
    return Response.json({ phone: await readPhone(auth) });
  } catch (error) {
    return authErrorResponse(error);
  }
}

const Body = z.object({ phone: z.string().max(30) });

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['student', 'teacher', 'super_admin']);
    const parsed = Body.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return Response.json({ error: 'Invalid number' }, { status: 400 });

    const phone = parsed.data.phone.trim();
    if (phone && !toWhatsAppNumber(phone)) {
      return Response.json(
        { error: 'That doesn’t look like a phone number. Include the country code, e.g. +91 98765 43210.' },
        { status: 400 },
      );
    }

    if (auth.role === 'student') {
      const id = await studentProfileId(auth.uid);
      if (!id) return Response.json({ error: 'Student profile not found' }, { status: 404 });
      await updateDoc(COLLECTIONS.STUDENT_PROFILES, id, { phone });
    } else {
      // The teacher profile may not exist yet: merge-create it
      await adminDb.collection(COLLECTIONS.TEACHER_PROFILES).doc(auth.uid)
        .set({ phone, updatedAt: nowISO() }, { merge: true });
    }
    return Response.json({ success: true, phone });
  } catch (error) {
    return authErrorResponse(error);
  }
}
