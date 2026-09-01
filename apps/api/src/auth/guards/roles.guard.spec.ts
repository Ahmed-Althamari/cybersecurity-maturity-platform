import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';

import { RolesGuard } from './roles.guard';

function makeContext(requiredRoles: string[] | undefined, user: unknown): ExecutionContext {
  return {
    getHandler: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  let guard: RolesGuard;

  beforeEach(() => {
    guard = new RolesGuard();
    jest.spyOn(Reflect, 'getMetadata');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('allows the request through when no @Roles() metadata is set', () => {
    jest.spyOn(Reflect, 'getMetadata').mockReturnValue(undefined);
    const context = makeContext(undefined, { role: 'READ_ONLY_VIEWER', roles: ['READ_ONLY_VIEWER'] });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('denies an unauthenticated request', () => {
    jest.spyOn(Reflect, 'getMetadata').mockReturnValue(['CISO']);
    const context = makeContext(['CISO'], undefined);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('allows a user whose single primary role matches', () => {
    jest.spyOn(Reflect, 'getMetadata').mockReturnValue(['CISO', 'PLATFORM_ADMIN']);
    const context = makeContext(['CISO', 'PLATFORM_ADMIN'], { role: 'CISO', roles: ['CISO'] });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('denies a user whose role is not in the required list', () => {
    jest.spyOn(Reflect, 'getMetadata').mockReturnValue(['CISO', 'PLATFORM_ADMIN']);
    const context = makeContext(['CISO', 'PLATFORM_ADMIN'], {
      role: 'READ_ONLY_VIEWER',
      roles: ['READ_ONLY_VIEWER'],
    });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('allows a multi-role user when a role OTHER than the first assigned one matches', () => {
    // Regression: user.role is only roles[0]; a user holding CISO as their
    // second role assignment must still pass an @Roles(CISO) check.
    jest.spyOn(Reflect, 'getMetadata').mockReturnValue(['CISO']);
    const context = makeContext(['CISO'], { role: 'READ_ONLY_VIEWER', roles: ['READ_ONLY_VIEWER', 'CISO'] });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('falls back to the singular role when roles[] is missing (older/malformed payloads)', () => {
    jest.spyOn(Reflect, 'getMetadata').mockReturnValue(['CISO']);
    const context = makeContext(['CISO'], { role: 'CISO', roles: undefined });
    expect(guard.canActivate(context)).toBe(true);
  });
});
