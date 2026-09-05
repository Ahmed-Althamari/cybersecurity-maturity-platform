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

    // signOptions.expiresIn matters here, not just the secret: refreshToken() needs a real
    // `exp` claim on the token it's revoking (mirrors production's JwtModule.register() in
    // auth.module.ts) — without it `payload.exp` is undefined and the revoked row's
    // `expiresAt` would be an invalid Date.
    jwtService = new JwtService({ secret: 'test-secret', signOptions: { expiresIn: '24h' } });
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

  it('stamps every issued token with a millisecond-precision issuedAtMs claim', async () => {
    const { access_token } = await authService.login({
      email: 'ciso@example.local',
      password: 'CorrectHorseBattery1!',
    });
    const payload = await authService.validateToken(access_token);
    expect(payload.issuedAtMs).toEqual(expect.any(Number));
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

  it('revokes the token it was called with when refreshing, so a stale refreshed-away token cannot linger', async () => {
    const { access_token } = await authService.login({
      email: 'ciso@example.local',
      password: 'CorrectHorseBattery1!',
    });
    const original = await authService.validateToken(access_token);

    await authService.refreshToken(access_token);

    expect(prisma.revokedToken.upsert).toHaveBeenCalledWith({
      where: { jti: original.jti },
      create: { jti: original.jti, expiresAt: new Date(original.exp * 1000) },
      update: {},
    });
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

  describe('changePassword', () => {
    const requestUser = {
      sub: 'user-1',
      email: 'ciso@example.local',
      name: 'CISO',
      tenantId: 'tenant-1',
      organisationId: 'org-1',
      role: 'CISO',
      roles: ['CISO'],
      jti: 'jti-current',
      exp: 1893456000,
    };

    it('rejects an incorrect current password', async () => {
      await expect(
        authService.changePassword(requestUser, { currentPassword: 'wrong', newPassword: 'ANewPassword123!' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('hashes and stores the new password, stamping passwordChangedAt', async () => {
      await authService.changePassword(requestUser, {
        currentPassword: 'CorrectHorseBattery1!',
        newPassword: 'ANewPassword123!',
      });

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: expect.objectContaining({ passwordChangedAt: expect.any(Date) }),
        }),
      );
      const updateArgs = prisma.user.update.mock.calls[0][0];
      expect(updateArgs.data.passwordHash).not.toBe('CorrectHorseBattery1!');
      await expect(bcrypt.compare('ANewPassword123!', updateArgs.data.passwordHash)).resolves.toBe(true);
    });

    it("returns a fresh token for the caller's own session, so it survives the change", async () => {
      const result = await authService.changePassword(requestUser, {
        currentPassword: 'CorrectHorseBattery1!',
        newPassword: 'ANewPassword123!',
      });

      expect(result.access_token).toBeDefined();
      const payload = await authService.validateToken(result.access_token);
      expect(payload.jti).not.toBe('jti-current');
      expect(payload.issuedAtMs).toEqual(expect.any(Number));
    });
  });
});
