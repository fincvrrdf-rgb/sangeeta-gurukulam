/**
 * API: /api/admin/batches
 *
 * GET   — List batch bands (super_admin)
 * PATCH — Update a batch band (super_admin)
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { queryDocs, updateDoc, nowISO } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';
import { writeAuditLog, extractRequestMeta } from '@/services/audit/log';
import { z } from 'zod';

const UpdateBatchBandSchema = z.object({
  id: z.string().min(1),
  assignedTeacherId: z.string().optional(),
  isActive: z.boolean().optional(),
  maxCapacityPerSlot: z.number().int().positive().optional(),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
}).refine((data) => Object.keys(data).length > 1, { message: 'At least one field to update must be provided' });

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request, ['teacher', 'super_admin']);

    const batches = await queryDocs(COLLECTIONS.BATCH_BANDS, []);

    return Response.json({ success: true, batches });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['super_admin']);
    const body = await request.json();
    const parsed = UpdateBatchBandSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const { id, ...updates } = parsed.data;

    await updateDoc(COLLECTIONS.BATCH_BANDS, id, {
      ...updates,
      updatedBy: auth.uid,
      updatedAt: nowISO(),
    });

    const { ipAddress, userAgent } = extractRequestMeta(request);
    await writeAuditLog({
      actorId: auth.uid,
      actorRole: auth.role,
      action: 'BATCH_BAND_UPDATED',
      entityType: 'batch_band',
      entityId: id,
      newState: updates,
      ipAddress,
      userAgent,
    });

    return Response.json({ success: true, batchId: id });
  } catch (error) {
    return authErrorResponse(error);
  }
}
