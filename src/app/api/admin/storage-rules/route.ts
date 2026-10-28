/**
 * API: GET /api/admin/storage-rules
 *
 * Checks the live Firebase Storage rules against storage.rules and publishes
 * ours if they differ. Returns { status }. Teacher / admin.
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { ensureStorageRules } from '@/lib/firebase/storage-rules';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request, ['teacher', 'super_admin']);
    return Response.json({ status: await ensureStorageRules() });
  } catch (error) {
    return authErrorResponse(error);
  }
}
