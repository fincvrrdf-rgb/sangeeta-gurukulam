/**
 * API: /api/admin/audit-logs
 *
 * GET — Fetch recent audit log entries (super_admin only).
 *       Returns up to `limit` entries (default 50) ordered by timestamp desc.
 *       Supports `action` and date-range filters via query params.
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { queryDocs } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request, ['super_admin']);

    const { searchParams } = new URL(request.url);
    const limitParam = Number(searchParams.get('limit') ?? '50');
    const limit = Math.min(Math.max(1, isNaN(limitParam) ? 50 : limitParam), 200);
    const actionFilter = searchParams.get('action') ?? '';
    const dateFrom = searchParams.get('dateFrom') ?? '';
    const dateTo = searchParams.get('dateTo') ?? '';

    // Build Firestore constraints
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const constraints: any[] = [
      { type: 'orderBy', field: 'timestamp', direction: 'desc' },
      { type: 'limit', value: limit },
    ];

    if (actionFilter) {
      constraints.unshift({
        type: 'where',
        field: 'action',
        op: '==',
        value: actionFilter,
      });
    }

    if (dateFrom) {
      constraints.unshift({
        type: 'where',
        field: 'timestamp',
        op: '>=',
        value: dateFrom,
      });
    }

    if (dateTo) {
      constraints.unshift({
        type: 'where',
        field: 'timestamp',
        op: '<=',
        value: dateTo + 'T23:59:59.999Z',
      });
    }

    const logs = await queryDocs(COLLECTIONS.AUDIT_LOGS, constraints);

    return Response.json({ success: true, logs, total: logs.length });
  } catch (error) {
    return authErrorResponse(error);
  }
}
