/**
 * API: /api/files/migrate
 *
 * GET  — how many old Firebase files still need moving to Supabase
 * POST — move them now (safe to repeat)
 * Teacher / admin only.
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { migrateFirebaseFiles } from '@/lib/storage/migrate';
import { supabaseConfigured, describeServiceKey } from '@/lib/storage/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request, ['teacher', 'super_admin']);
    const report = await migrateFirebaseFiles(true);
    return Response.json({
      configured: supabaseConfigured(),
      keyKind: describeServiceKey(),
      pending: report.pending,
      alreadyMoved: report.alreadyMoved,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth(request, ['teacher', 'super_admin']);
    if (!supabaseConfigured()) {
      return Response.json(
        { error: 'File storage is not set up yet (SUPABASE_SERVICE_ROLE_KEY missing on the server).' },
        { status: 503 },
      );
    }
    const report = await migrateFirebaseFiles(false);
    return Response.json({ success: true, ...report });
  } catch (error) {
    return authErrorResponse(error);
  }
}
