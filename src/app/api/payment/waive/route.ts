/**
 * API: POST /api/payment/waive
 *
 * Teacher or admin waives a compulsory payment for a student.
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { COLLECTIONS } from '@/domain/constants';
import { writeAuditLog, extractRequestMeta } from '@/services/audit/log';
import { waivePayment } from '@/services/payment/status';
import { z } from 'zod';

const WaiveSchema = z.object({
  studentId: z.string().min(1),
  cycleMonth: z.string().regex(/^\d{4}-\d{2}$/, 'Must be YYYY-MM format'),
  reason: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['teacher', 'super_admin']);
    const body = await request.json();
    const parsed = WaiveSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const { studentId, cycleMonth, reason } = parsed.data;

    // Waive payment
    await waivePayment(studentId, cycleMonth, auth.uid, reason);

    // Audit log
    const { ipAddress, userAgent } = extractRequestMeta(request);
    await writeAuditLog({
      actorId: auth.uid,
      actorRole: auth.role,
      action: 'PAYMENT_WAIVED',
      entityType: 'monthly_payment_status',
      entityId: `${studentId}_${cycleMonth}`,
      newState: { studentId, cycleMonth, reason, waivedBy: auth.uid },
      ipAddress,
      userAgent,
    });

    return Response.json({ success: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}
