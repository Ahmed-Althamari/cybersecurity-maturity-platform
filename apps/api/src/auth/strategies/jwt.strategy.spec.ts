import { UnauthorizedException } from '@nestjs/common';

import type { AuthService } from '../auth.service';

import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let authService: { isRevoked: jest.Mock };
  let prisma: { user: { findUnique: jest.Mock } };

  const payload = {
    sub: 'user-1',
    email: 'ciso@example.local',
    name: 'CISO',
    tenantId: 'tenant-1',
    organisationId: 'org-1',
    role: 'CISO',
    roles: ['CISO'],
    jti: 'jti-123',
    exp: 1893456000,
  };

  beforeEach(() => {
    authService = { isRevoked: jest.fn() };
    prisma = { user: { findUnique: jest.fn().mockResolvedValue({ passwordChangedAt: null }) } };
    strategy = new JwtStrategy(authService as unknown as AuthService, prisma as never);
  });

  it('rejects a token whose jti has been revoked', async () => {
    authService.isRevoked.mockResolvedValueOnce(true);
    await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
  });

  it('returns the request-user shape, including jti and exp, for a non-revoked token', async () => {
    authService.isRevoked.mockResolvedValueOnce(false);
    const result = await strategy.validate(payload);

    expect(result).toEqual({
      sub: 'user-1',
      email: 'ciso@example.local',
      name: 'CISO',
      tenantId: 'tenant-1',
      organisationId: 'org-1',
      role: 'CISO',
      roles: ['CISO'],
      jti: 'jti-123',
      exp: 1893456000,
    });
  });

  it('checks revocation using this token\'s own jti', async () => {
    authService.isRevoked.mockResolvedValueOnce(false);
    await strategy.validate(payload);
    expect(authService.isRevoked).toHaveBeenCalledWith('jti-123');
  });

  it('rejects a token issued before the user\'s last password change', async () => {
    authService.isRevoked.mockResolvedValueOnce(false);
    prisma.user.findUnique.mockResolvedValueOnce({ passwordChangedAt: new Date(2026, 0, 2) });
    const tokenPayload = { ...payload, issuedAtMs: new Date(2026, 0, 1).getTime() };

    await expect(strategy.validate(tokenPayload)).rejects.toThrow(UnauthorizedException);
  });

  it('accepts a token issued after the user\'s last password change', async () => {
    authService.isRevoked.mockResolvedValueOnce(false);
    prisma.user.findUnique.mockResolvedValueOnce({ passwordChangedAt: new Date(2026, 0, 1) });
    const tokenPayload = { ...payload, issuedAtMs: new Date(2026, 0, 2).getTime() };

    await expect(strategy.validate(tokenPayload)).resolves.toBeDefined();
  });

  it('lets an older token with no issuedAtMs claim through the password-change check', async () => {
    authService.isRevoked.mockResolvedValueOnce(false);
    prisma.user.findUnique.mockResolvedValueOnce({ passwordChangedAt: new Date(2026, 0, 1) });

    await expect(strategy.validate(payload)).resolves.toBeDefined();
  });
});
