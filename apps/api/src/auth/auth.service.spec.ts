import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';

import { PrismaService } from '../prisma/prisma.service';

import { AuthService } from './auth.service';

type MockModel = Record<string, jest.Mock>;

describe('AuthService', () => {
  let authService: AuthService;
  let prisma: { user: MockModel; userRoleAssignment: MockModel; revokedToken: MockModel };
  let jwtService: JwtService;

  const activeUser = {
    id: 'user-1',
    tenantId: 'tenant-1',
    organisationId: 'org-1',
    email: 'ciso@example.local',
    name: 'CISO',
    isActive: true,
    deletedAt: null,
    userRoleAssignments: [{ role: 'CISO', deletedAt: null }],
  };

  beforeEach(async () => {
    const passwordHash = await bcrypt.hash('CorrectHorseBattery1!', 12);

    prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue({ ...activeUser, passwordHash }),
        update: jest.fn().mockResolvedValue(activeUser),
      },
      userRoleAssignment: {},
      revokedToken: { upsert: jest.fn(), findUnique: jest.fn() },
    };

    jwtService = new JwtService({ secret: 'test-secret' });
    authService = new AuthService(jwtService, prisma as unknown as PrismaService);
  });

  it('issues a token for valid credentials', async () => {
    const result = await authService.login({
      email: 'ciso@example.local',
      password: 'CorrectHorseBattery1!',
    });

    expect(result.access_token).toBeDefined();
    expect(result.user.role).toBe('CISO');
    expect(result.user.tenantId).toBe('tenant-1');
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'user-1' } }),
    );
  });

  it('rejects an incorrect password', async () => {
    await expect(
      authService.login({ email: 'ciso@example.local', password: 'wrong-password' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a login for an unknown email', async () => {
    prisma.user.findFirst.mockResolvedValueOnce(null);
    await expect(
      authService.login({ email: 'nobody@example.local', password: 'irrelevant' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a user without a password hash set', async () => {
    prisma.user.findFirst.mockResolvedValueOnce({ ...activeUser, passwordHash: null });
    await expect(
      authService.login({ email: 'ciso@example.local', password: 'anything123' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('round-trips a token through refreshToken', async () => {
    const { access_token } = await authService.login({
      email: 'ciso@example.local',
      password: 'CorrectHorseBattery1!',
    });

    const refreshed = await authService.refreshToken(access_token);
    expect(refreshed.access_token).toBeDefined();

    const payload = await authService.validateToken(refreshed.access_token);
    expect(payload.sub).toBe('user-1');
    expect(payload.tenantId).toBe('tenant-1');
  });

  it('issues a unique jti per token, including across a refresh', async () => {
    const { access_token } = await authService.login({
      email: 'ciso@example.local',
      password: 'CorrectHorseBattery1!',
    });
    const original = await authService.validateToken(access_token);
    expect(original.jti).toEqual(expect.any(String));

    const { access_token: refreshedToken } = await authService.refreshToken(access_token);
    const refreshed = await authService.validateToken(refreshedToken);

    // A refreshed token is independently revocable — logging out of one session must never
    // revoke a token minted for a different one.
    expect(refreshed.jti).not.toBe(original.jti);
  });

  describe('logout / isRevoked', () => {
    it('upserts a RevokedToken row keyed by jti with the token-supplied expiry', async () => {
      const expiresAt = new Date('2026-01-01T00:00:00.000Z');
      await authService.logout('jti-123', expiresAt);

      expect(prisma.revokedToken.upsert).toHaveBeenCalledWith({
        where: { jti: 'jti-123' },
        create: { jti: 'jti-123', expiresAt },
        update: {},
      });
    });

    it('reports a token revoked once its jti has a RevokedToken row', async () => {
      prisma.revokedToken.findUnique.mockResolvedValueOnce({ jti: 'jti-123' });
      await expect(authService.isRevoked('jti-123')).resolves.toBe(true);
    });

    it('reports a token not revoked when no matching row exists', async () => {
      prisma.revokedToken.findUnique.mockResolvedValueOnce(null);
      await expect(authService.isRevoked('jti-456')).resolves.toBe(false);
    });
  });
});
