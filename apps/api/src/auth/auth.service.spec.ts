import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';

import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

import { AuthService } from './auth.service';

describe('AuthService', () => {
  let authService: AuthService;
  let prisma: { user: any; userRoleAssignment: any; revokedToken: any };
  let jwtService: JwtService;
  let auditService: { log: jest.Mock };

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
      revokedToken: {
        upsert: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };

    jwtService = new JwtService({ secret: 'test-secret' });
    auditService = { log: jest.fn() };
    authService = new AuthService(
      jwtService,
      prisma as unknown as PrismaService,
      auditService as unknown as AuditService,
    );
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
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'LOGIN', tenantId: 'tenant-1', userId: 'user-1' }),
    );
  });

  it('issues a token carrying a jti claim, unique per login', async () => {
    const first = await authService.login({
      email: 'ciso@example.local',
      password: 'CorrectHorseBattery1!',
    });
    const second = await authService.login({
      email: 'ciso@example.local',
      password: 'CorrectHorseBattery1!',
    });

    const firstPayload = await authService.validateToken(first.access_token);
    const secondPayload = await authService.validateToken(second.access_token);
    expect(firstPayload.jti).toEqual(expect.any(String));
    expect(secondPayload.jti).toEqual(expect.any(String));
    expect(firstPayload.jti).not.toBe(secondPayload.jti);
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

  it('round-trips a token through refreshToken, rotating the jti and revoking the old one', async () => {
    const { access_token } = await authService.login({
      email: 'ciso@example.local',
      password: 'CorrectHorseBattery1!',
    });
    const originalPayload = await authService.validateToken(access_token);

    const refreshed = await authService.refreshToken(access_token);
    expect(refreshed.access_token).toBeDefined();

    const payload = await authService.validateToken(refreshed.access_token);
    expect(payload.sub).toBe('user-1');
    expect(payload.tenantId).toBe('tenant-1');
    // Rotated: a fresh jti, not a reused one -- see AuthService.refreshToken.
    expect(payload.jti).not.toBe(originalPayload.jti);

    expect(prisma.revokedToken.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { jti: originalPayload.jti },
        create: expect.objectContaining({ jti: originalPayload.jti, userId: 'user-1' }),
      }),
    );
  });

  it('logs a LOGOUT audit event for the calling user', async () => {
    await authService.logout({
      sub: 'user-1',
      email: 'ciso@example.local',
      name: 'CISO',
      tenantId: 'tenant-1',
      organisationId: 'org-1',
      role: 'CISO',
      roles: ['CISO'],
      jti: 'test-jti',
    });

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'LOGOUT', tenantId: 'tenant-1', userId: 'user-1' }),
    );
  });

  it('revokes the token being logged out of when exp is present (the real request.user shape)', async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    await authService.logout({
      sub: 'user-1',
      email: 'ciso@example.local',
      name: 'CISO',
      tenantId: 'tenant-1',
      organisationId: 'org-1',
      role: 'CISO',
      roles: ['CISO'],
      jti: 'test-jti',
      exp,
    });

    expect(prisma.revokedToken.upsert).toHaveBeenCalledWith({
      where: { jti: 'test-jti' },
      create: {
        jti: 'test-jti',
        tenantId: 'tenant-1',
        userId: 'user-1',
        expiresAt: new Date(exp * 1000),
      },
      update: {},
    });
  });

  it('does not attempt revocation when logging out a payload with no exp (e.g. a test/malformed call)', async () => {
    await authService.logout({
      sub: 'user-1',
      email: 'ciso@example.local',
      name: 'CISO',
      tenantId: 'tenant-1',
      organisationId: 'org-1',
      role: 'CISO',
      roles: ['CISO'],
      jti: 'test-jti',
    });

    expect(prisma.revokedToken.upsert).not.toHaveBeenCalled();
  });
});
