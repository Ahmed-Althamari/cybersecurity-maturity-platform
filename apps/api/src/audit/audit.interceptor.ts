import { randomUUID } from 'crypto';
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { AuditAction } from '@cmmp/shared';
import { Observable, tap } from 'rxjs';
import { AuditService } from './audit.service';

const ACTION_BY_METHOD: Record<string, AuditAction> = {
  POST: AuditAction.CREATE,
  PUT: AuditAction.UPDATE,
  PATCH: AuditAction.UPDATE,
  DELETE: AuditAction.DELETE,
};

/**
 * The "logging middleware" of Phase 13: a global interceptor rather than
 * scattering `auditService.log()` calls through every controller method.
 * Auto-logs every mutating request (POST/PUT/PATCH/DELETE) once the route
 * handler has actually succeeded, deriving what it can from the request/
 * response rather than requiring each endpoint to opt in.
 *
 * Deliberate scope limit: this captures *who did what to which resource
 * when*, plus the response body as `newValue` -- it does not capture a
 * `previousValue` diff, since that would need a read-before-write at every
 * mutating endpoint. LOGIN/LOGOUT (Auth has no `request.user` yet at
 * login, and DELETE-shaped semantics don't fit logout) are logged
 * explicitly by AuthService instead of by this interceptor.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const action = ACTION_BY_METHOD[request.method as string];
    const user = request.user;

    if (!action || !user) {
      return next.handle();
    }

    const resource = context.getClass().name.replace(/Controller$/, '');
    if (resource === 'Auth') {
      // AuthController logs LOGIN/LOGOUT itself (login has no request.user
      // yet at request time, and logout isn't really a "CREATE"); avoid a
      // second, mis-tagged audit entry for the same request.
      return next.handle();
    }
    const correlationId = (request.headers['x-request-id'] as string | undefined) ?? randomUUID();

    return next.handle().pipe(
      tap((responseBody) => {
        const resourceId = request.params?.id ?? (responseBody as { id?: string })?.id ?? null;
        void this.auditService.log({
          tenantId: user.tenantId,
          userId: user.sub,
          action,
          resource,
          resourceId,
          description: `${request.method} ${request.route?.path ?? request.url}`,
          newValue: responseBody,
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
          correlationId,
        });
      }),
    );
  }
}
