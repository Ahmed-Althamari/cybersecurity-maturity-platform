import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';

import { PrismaService } from '../prisma/prisma.service';

import { AuthService } from './auth.service';

type MockModel = Record<string, jest.Mock>;

describe('AuthService', () => {
  let authService: AuthService;
  let prisma: { user: MockModel; userRoleAssignment: MockModel };
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
});
