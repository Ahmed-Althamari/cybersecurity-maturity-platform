import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';

import { ExecutiveViewerScopeGuard } from './executive-viewer-scope.guard';

function makeContext(user: unknown): ExecutionContext {
  return {
    getHandler: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('ExecutiveViewerScopeGuard', () => {
  let guard: ExecutiveViewerScopeGuard;

  beforeEach(() => {
    guard = new ExecutiveViewerScopeGuard();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('allows an unauthenticated request through (no user attached, e.g. health/login)', () => {
    const context = makeContext(undefined);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows any non-EXECUTIVE_VIEWER role through unconditionally', () => {
    jest.spyOn(Reflect, 'getMetadata').mockReturnValue(undefined);
    const context = makeContext({ role: 'READ_ONLY_VIEWER', roles: ['READ_ONLY_VIEWER'] });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows a user holding EXECUTIVE_VIEWER alongside a broader role, on any endpoint', () => {
    // Regression: a multi-role user must keep their broader role's access --
    // matching RolesGuard's own treatment of multi-role users.
    jest.spyOn(Reflect, 'getMetadata').mockReturnValue(undefined);
    const context = makeContext({ role: 'EXECUTIVE_VIEWER', roles: ['EXECUTIVE_VIEWER', 'GRC_MANAGER'] });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows an EXECUTIVE_VIEWER-only user onto a handler marked @ExecutiveDashboardAccessible()', () => {
    jest.spyOn(Reflect, 'getMetadata').mockReturnValue(true);
    const context = makeContext({ role: 'EXECUTIVE_VIEWER', roles: ['EXECUTIVE_VIEWER'] });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('denies an EXECUTIVE_VIEWER-only user on a handler with no accessibility metadata', () => {
    jest.spyOn(Reflect, 'getMetadata').mockReturnValue(undefined);
    const context = makeContext({ role: 'EXECUTIVE_VIEWER', roles: ['EXECUTIVE_VIEWER'] });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('falls back to the singular role when roles[] is missing (older/malformed payloads)', () => {
    jest.spyOn(Reflect, 'getMetadata').mockReturnValue(true);
    const context = makeContext({ role: 'EXECUTIVE_VIEWER', roles: undefined });
    expect(guard.canActivate(context)).toBe(true);
  });
});
