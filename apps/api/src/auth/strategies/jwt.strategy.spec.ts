import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../prisma/prisma.service';

import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let prisma: { revokedToken: { findUnique: jest.Mock } };

  const payload = {
    sub: 'user-1',
    email: 'ciso@example.local',
    name: 'CISO',
    tenantId: 'tenant-1',
    organisationId: 'org-1',
    role: 'CISO',
    roles: ['CISO'],
    jti: 'jti-1',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  };

  beforeEach(() => {
    prisma = { revokedToken: { findUnique: jest.fn().mockResolvedValue(null) } };
    const config = new ConfigService({ JWT_SECRET: 'test-secret' });
    strategy = new JwtStrategy(config, prisma as unknown as PrismaService);
  });

  it('returns the decoded claims (including jti/exp) when the token is not revoked', async () => {
    const result = await strategy.validate(payload);
    expect(result).toEqual({
      sub: 'user-1',
      email: 'ciso@example.local',
      name: 'CISO',
      tenantId: 'tenant-1',
      organisationId: 'org-1',
      role: 'CISO',
      roles: ['CISO'],
      jti: 'jti-1',
      exp: payload.exp,
    });
    expect(prisma.revokedToken.findUnique).toHaveBeenCalledWith({ where: { jti: 'jti-1' } });
  });

  it('rejects a token whose jti is in the revocation list (logged out or refreshed away)', async () => {
    prisma.revokedToken.findUnique.mockResolvedValueOnce({ jti: 'jti-1' });
    await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
  });
});
