import { of } from 'rxjs';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { AuditInterceptor } from './audit.interceptor';
import { AuditService } from './audit.service';

class FakeController {}

function makeContext(overrides: {
  method: string;
  user?: unknown;
  params?: Record<string, string>;
  controllerName?: string;
}): ExecutionContext {
  const request = {
    method: overrides.method,
    user: overrides.user,
    params: overrides.params ?? {},
    headers: { 'user-agent': 'jest' },
    ip: '127.0.0.1',
    route: { path: '/api/v1/risks' },
    url: '/api/v1/risks',
  };

  const controllerClass = { name: overrides.controllerName ?? 'RisksController' };

  return {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => request }),
    getClass: () => controllerClass as unknown as typeof FakeController,
  } as unknown as ExecutionContext;
}

function handlerReturning(value: unknown): CallHandler {
  return { handle: () => of(value) };
}

describe('AuditInterceptor', () => {
  let auditService: { log: jest.Mock };
  let interceptor: AuditInterceptor;

  beforeEach(() => {
    auditService = { log: jest.fn() };
    interceptor = new AuditInterceptor(auditService as unknown as AuditService);
  });

  function run(context: ExecutionContext, handler: CallHandler) {
    return new Promise<void>((resolve) => {
      interceptor.intercept(context, handler).subscribe({ complete: resolve });
    });
  }

  it('logs a CREATE event for a POST with an authenticated user', async () => {
    const context = makeContext({ method: 'POST', user: { tenantId: 'tenant-a', sub: 'user-1' } });
    await run(context, handlerReturning({ id: 'risk-1', title: 'x' }));

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        userId: 'user-1',
        action: 'CREATE',
        resource: 'Risks',
        resourceId: 'risk-1',
      }),
    );
  });

  it('prefers the route param id over the response body id for resourceId', async () => {
    const context = makeContext({
      method: 'PATCH',
      user: { tenantId: 'tenant-a', sub: 'user-1' },
      params: { id: 'risk-from-url' },
    });
    await run(context, handlerReturning({ id: 'risk-from-body' }));

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'UPDATE', resourceId: 'risk-from-url' }),
    );
  });

  it('does not log a GET (read-only) request', async () => {
    const context = makeContext({ method: 'GET', user: { tenantId: 'tenant-a', sub: 'user-1' } });
    await run(context, handlerReturning([{ id: 'risk-1' }]));
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('does not log an unauthenticated request', async () => {
    const context = makeContext({ method: 'POST', user: undefined });
    await run(context, handlerReturning({ id: 'risk-1' }));
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('does not log Auth controller routes (login/logout log themselves)', async () => {
    const context = makeContext({
      method: 'POST',
      user: { tenantId: 'tenant-a', sub: 'user-1' },
      controllerName: 'AuthController',
    });
    await run(context, handlerReturning({ message: 'Logged out successfully' }));
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('maps DELETE to the DELETE action', async () => {
    const context = makeContext({
      method: 'DELETE',
      user: { tenantId: 'tenant-a', sub: 'user-1' },
      params: { id: 'risk-1' },
    });
    await run(context, handlerReturning({ message: 'deleted' }));
    expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'DELETE' }));
  });
});
