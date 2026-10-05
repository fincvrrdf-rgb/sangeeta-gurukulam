/**
 * POST /api/admin/dedup-instances
 *
 * One-shot cleanup: removes duplicate class instances that share the same
 * slotId + date. Keeps the oldest document (lowest createdAt), deletes the
 * rest. Super-admin only.
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { queryDocs, deleteDoc } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    await requireAuth(request, ['super_admin']);

    const instances = await queryDocs<Record<string, unknown>>(COLLECTIONS.CLASS_INSTANCES, []);

    // Group by slotId|date
    const groups = new Map<string, { id: string; createdAt: string }[]>();
    for (const inst of instances) {
      const slotId = inst.slotId as string ?? '';
      const startTime = inst.scheduledStartTime as string ?? '';
      const dateStr = startTime.slice(0, 10);
      const key = `${slotId}|${dateStr}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push({ id: inst.id as string, createdAt: inst.createdAt as string ?? '' });
    }

    let deleted = 0;
    const dupGroups: string[] = [];

    for (const [key, docs] of groups) {
      if (docs.length <= 1) continue;
      // Sort oldest first, keep first, delete the rest
      docs.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const toDelete = docs.slice(1);
      dupGroups.push(`${key} (${docs.length} copies → keeping 1, deleting ${toDelete.length})`);
      for (const doc of toDelete) {
        await deleteDoc(COLLECTIONS.CLASS_INSTANCES, doc.id);
        deleted++;
      }
    }

    return Response.json({
      success: true,
      duplicateGroupsFound: dupGroups.length,
      documentsDeleted: deleted,
      details: dupGroups,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
