/**
 * API: /api/admin/batches
 *
 * GET   — List batch bands (super_admin)
 * PATCH — Update a batch band (super_admin)
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { queryDocs, updateDoc, createDoc, nowISO } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';
import { writeAuditLog, extractRequestMeta } from '@/services/audit/log';
import { z } from 'zod';

const CreateBatchBandSchema = z.object({
  code: z.enum(['A', 'B', 'C', 'D']),
  name: z.string().min(1),
  description: z.string().default(''),
  maxCapacityPerSlot: z.number().int().positive().default(10),
  isActive: z.boolean().default(true),
});

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

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['super_admin']);
    const body = await request.json();

    // Seed mode: create all 4 standard batches
    if (body.seed === true) {
      const existing = await queryDocs<Record<string, unknown>>(COLLECTIONS.BATCH_BANDS, []);
      const existingCodes = new Set(existing.map((b) => b.code));
      const STANDARD_BATCHES = [
        { code: 'A', name: 'Batch A — Mon/Wed Morning', description: 'Monday & Wednesday 5:30–6:30 AM IST' },
        { code: 'B', name: 'Batch B — Mon/Wed Evening', description: 'Monday & Wednesday 4:30–5:30 PM IST' },
        { code: 'C', name: 'Batch C — Tue/Fri Morning', description: 'Tuesday & Friday 5:30–6:30 AM IST' },
        { code: 'D', name: 'Batch D — Tue/Fri Evening', description: 'Tuesday & Friday 4:30–5:30 PM IST' },
      ];
      let created = 0;
      for (const b of STANDARD_BATCHES) {
        if (!existingCodes.has(b.code)) {
          await createDoc(COLLECTIONS.BATCH_BANDS, {
            code: b.code,
            name: b.name,
            description: b.description,
            lessonIdFrom: '',
            lessonIdTo: '',
            teachingUnitScopeNote: null,
            assignedTeacherId: '',
            isActive: true,
            maxCapacityPerSlot: 10,
            createdAt: nowISO(),
            updatedAt: nowISO(),
          });
          created++;
        }
      }
      return Response.json({ success: true, created, message: `${created} batch band(s) created.` });
    }

    const parsed = CreateBatchBandSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const { code, name, description, maxCapacityPerSlot, isActive } = parsed.data;
    const id = await createDoc(COLLECTIONS.BATCH_BANDS, {
      code, name, description,
      lessonIdFrom: '', lessonIdTo: '', teachingUnitScopeNote: null,
      assignedTeacherId: '',
      isActive, maxCapacityPerSlot,
      createdAt: nowISO(), updatedAt: nowISO(),
    });

    const { ipAddress, userAgent } = extractRequestMeta(request);
    await writeAuditLog({
      actorId: auth.uid, actorRole: auth.role,
      action: 'BATCH_BAND_UPDATED',
      entityType: 'batch_band', entityId: id,
      newState: { code, name, isActive },
      ipAddress, userAgent,
    });

    return Response.json({ success: true, id });
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
