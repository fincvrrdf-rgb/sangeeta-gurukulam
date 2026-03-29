/**
 * services/audit/log.ts
 *
 * Writes immutable audit log entries for critical actions.
 * Called from API routes after every critical mutation.
 * Audit logs are write-only — non-admins cannot read them.
 */

import { createDoc } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';
import type { AuditAction, UserRole } from '@/domain/enums';

interface AuditLogInput {
  actorId: string;
  actorRole: UserRole;
  action: AuditAction;
  entityType: string;
  entityId: string;
  previousState?: Record<string, unknown> | null;
  newState?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  notes?: string | null;
}

/**
 * Write an audit log entry. This is a fire-and-forget operation —
 * failures are logged to console but do not block the calling operation.
 */
export async function writeAuditLog(input: AuditLogInput): Promise<void> {
  try {
    await createDoc(COLLECTIONS.AUDIT_LOGS, {
      actorId: input.actorId,
      actorRole: input.actorRole,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      previousStateJson: input.previousState ? JSON.stringify(input.previousState) : null,
      newStateJson: input.newState ? JSON.stringify(input.newState) : null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      timestamp: new Date().toISOString(),
      notes: input.notes ?? null,
    });
  } catch (error) {
    // Audit log write failure must not block the main operation.
    // Log to server console for operational monitoring.
    console.error('[AUDIT_LOG_WRITE_FAILED]', input.action, input.entityId, error);
  }
}

/**
 * Extract IP and User-Agent from a request for audit logging.
 */
export function extractRequestMeta(request: Request): { ipAddress: string | null; userAgent: string | null } {
  return {
    ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: request.headers.get('user-agent') ?? null,
  };
}
