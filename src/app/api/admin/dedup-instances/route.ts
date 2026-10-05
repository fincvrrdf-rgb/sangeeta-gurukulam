/**
 * POST /api/admin/dedup-instances
 *
 * Cleanup for duplicate classes. A batch should have at most one class per
 * day, so this:
 *  1. deactivates duplicate recurring slots (same batch + weekday), which is
 *     what kept creating the duplicates, and
 *  2. removes duplicate class instances (same batch + date), keeping the one
 *     with attendance (else non-cancelled, else oldest). Instances that have
 *     attendance are never deleted.
 * Super-admin only.
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { loadBandCodes, deactivateDuplicateSlots, removeDuplicateInstances } from '@/lib/classes/dedupe';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    await requireAuth(request, ['super_admin']);

    const bandCodes = await loadBandCodes();
    const slotsDeactivated = await deactivateDuplicateSlots(bandCodes);
    const result = await removeDuplicateInstances(bandCodes);

    return Response.json({
      success: true,
      duplicateSlotsDeactivated: slotsDeactivated,
      duplicateGroupsFound: result.groupsFound,
      documentsDeleted: result.deleted,
      keptWithAttendance: result.keptWithAttendance,
      details: result.details,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
