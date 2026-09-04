import type { AuditAction } from '@cmmp/database';
import { SetMetadata } from '@nestjs/common';

export const AUDIT_LOG_KEY = 'auditLog';

export interface AuditLogMetadata {
  action: AuditAction;
  resource: string;
}

/**
 * Marks a controller method for AuditInterceptor to record. `resource` is
 * a human label ("Risk", "Assessment", ...), not a route/table name — it
 * matches AuditEvent.resource so a query like `?resource=Risk` reads
 * naturally.
 */
export const AuditLog = (action: AuditAction, resource: string) => SetMetadata(AUDIT_LOG_KEY, { action, resource } satisfies AuditLogMetadata);
