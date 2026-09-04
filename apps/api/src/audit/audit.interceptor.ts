import { randomUUID } from 'crypto';

import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

import type { AuthenticatedRequest } from '../auth/types/authenticated-request';

import { AuditService } from './audit.service';
import { AUDIT_LOG_KEY, type AuditLogMetadata } from './decorators/audit-log.decorator';
import { safeStringifyForAudit } from './sanitize';

function readStringField(value: unknown, key: string): string | undefined {
  if (value && typeof value === 'object' && key in value) {
    const field = (value as Record<string, unknown>)[key];
    return typeof field === 'string' ? field : undefined;
  }
  return undefined;
}

function readNestedStringField(value: unknown, key: string, nestedKey: string): string | undefined {
  if (value && typeof value === 'object' && key in value) {
    return readStringField((value as Record<string, unknown>)[key], nestedKey);
  }
  return undefined;
}

/**
 * Global interceptor (registered once in AuditModule) that turns
 * `@AuditLog(action, resource)` on a controller method into an
 * AuditEvent row after a successful response. Everything else — routes
 * with no decorator — passes through untouched, so adding auditing to a
 * new endpoint is one decorator, not a scattered service-layer call.
 *
 * Login is the one endpoint this runs before JwtAuthGuard has populated
 * `request.user`, so actor identity is read from the response body
 * (`{ user: { id, tenantId } }`) as a fallback.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private reflector: Reflector,
    private auditService: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const metadata = this.reflector.get<AuditLogMetadata | undefined>(AUDIT_LOG_KEY, context.getHandler());
    if (!metadata || context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    return next.handle().pipe(
      tap((responseBody: unknown) => {
        void this.recordFromResponse(metadata, request, responseBody);
      }),
    );
  }

  private async recordFromResponse(metadata: AuditLogMetadata, request: AuthenticatedRequest, responseBody: unknown): Promise<void> {
    const userId = request.user?.sub ?? readNestedStringField(responseBody, 'user', 'id');
    const tenantId = request.user?.tenantId ?? readNestedStringField(responseBody, 'user', 'tenantId');
    if (!userId || !tenantId) {
      // Can't attribute this event to anyone (e.g. a failed login never reaches here since it throws) — skip rather than write a garbage row.
      return;
    }

    const resourceId =
      readStringField(responseBody, 'id') ?? (request.params?.id as string | undefined) ?? (metadata.resource === 'User' ? userId : undefined);
    const req = request as Request;

    await this.auditService.record({
      tenantId,
      userId,
      action: metadata.action,
      resource: metadata.resource,
      resourceId,
      description: `${metadata.action} ${metadata.resource}${resourceId ? ` ${resourceId}` : ''}`,
      newValue: safeStringifyForAudit(request.body),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      correlationId: (req.headers['x-correlation-id'] as string | undefined) ?? randomUUID(),
    });
  }
}
