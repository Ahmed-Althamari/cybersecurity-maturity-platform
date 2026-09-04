import type { CallHandler, ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { of } from 'rxjs';

import { AuditInterceptor } from './audit.interceptor';
import type { AuditService } from './audit.service';
import { AUDIT_LOG_KEY } from './decorators/audit-log.decorator';

function makeContext(request: Record<string, unknown>): ExecutionContext {
  return {
    getHandler: () => (() => undefined) as unknown as () => void,
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function makeCallHandler(response: unknown): CallHandler {
  return { handle: () => of(response) };
}

async function flushMicrotasks() {
  await new Promise((resolve) => setImmediate(resolve));
}

describe('AuditInterceptor', () => {
  let reflector: { get: jest.Mock };
  let auditService: { record: jest.Mock };
  let interceptor: AuditInterceptor;

  beforeEach(() => {
    reflector = { get: jest.fn() };
    auditService = { record: jest.fn().mockResolvedValue(undefined) };
    interceptor = new AuditInterceptor(reflector as unknown as Reflector, auditService as unknown as AuditService);
  });

  it('passes through untouched when the handler has no @AuditLog metadata', (done) => {
    reflector.get.mockReturnValueOnce(undefined);
    const context = makeContext({});
    const handler = makeCallHandler({ id: 'risk-1' });

    interceptor.intercept(context, handler).subscribe(async (result) => {
      expect(result).toEqual({ id: 'risk-1' });
      await flushMicrotasks();
      expect(auditService.record).not.toHaveBeenCalled();
      done();
    });
  });

  it('records an event using the authenticated user and route param id', (done) => {
    reflector.get.mockReturnValueOnce({ action: 'DELETE', resource: 'Risk' });
    const request = {
      user: { sub: 'user-1', tenantId: 'tenant-1' },
      params: { id: 'risk-1' },
      body: {},
      headers: { 'user-agent': 'jest' },
      ip: '127.0.0.1',
    };
    const context = makeContext(request);
    const handler = makeCallHandler({ message: 'Risk deleted successfully' });

    interceptor.intercept(context, handler).subscribe(async () => {
      await flushMicrotasks();
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 'tenant-1', userId: 'user-1', action: 'DELETE', resource: 'Risk', resourceId: 'risk-1' }),
      );
      done();
    });
  });

  it('falls back to the response body user for an unauthenticated login', (done) => {
    reflector.get.mockReturnValueOnce({ action: 'LOGIN', resource: 'User' });
    const request = { params: {}, body: { email: 'a@b.com', password: 'hunter2' }, headers: {}, ip: '127.0.0.1' };
    const context = makeContext(request);
    const handler = makeCallHandler({ access_token: 'jwt', user: { id: 'user-1', tenantId: 'tenant-1' } });

    interceptor.intercept(context, handler).subscribe(async () => {
      await flushMicrotasks();
      const recordArgs = auditService.record.mock.calls[0][0];
      expect(recordArgs.userId).toBe('user-1');
      expect(recordArgs.tenantId).toBe('tenant-1');
      expect(recordArgs.resourceId).toBe('user-1');
      expect(recordArgs.newValue).toContain('[REDACTED]');
      expect(recordArgs.newValue).not.toContain('hunter2');
      done();
    });
  });

  it('skips recording when neither the request user nor the response body can identify an actor', (done) => {
    reflector.get.mockReturnValueOnce({ action: 'CREATE', resource: 'Risk' });
    const request = { params: {}, body: {}, headers: {}, ip: '127.0.0.1' };
    const context = makeContext(request);
    const handler = makeCallHandler({ id: 'risk-1' });

    interceptor.intercept(context, handler).subscribe(async () => {
      await flushMicrotasks();
      expect(auditService.record).not.toHaveBeenCalled();
      done();
    });
  });
});
