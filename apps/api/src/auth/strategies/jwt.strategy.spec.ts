import { UnauthorizedException } from '@nestjs/common';

import type { AuthService } from '../auth.service';

import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let authService: { isRevoked: jest.Mock };

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
    strategy = new JwtStrategy(authService as unknown as AuthService);
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
});
