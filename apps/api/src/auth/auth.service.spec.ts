import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';

import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

import { AuthService } from './auth.service';

describe('AuthService', () => {
  let authService: AuthService;
  let prisma: { user: any; userRoleAssignment: any };
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

  it('logs a LOGOUT audit event for the calling user', async () => {
    await authService.logout({
      sub: 'user-1',
      email: 'ciso@example.local',
      name: 'CISO',
      tenantId: 'tenant-1',
      organisationId: 'org-1',
      role: 'CISO',
      roles: ['CISO'],
    });

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'LOGOUT', tenantId: 'tenant-1', userId: 'user-1' }),
    );
  });
});
