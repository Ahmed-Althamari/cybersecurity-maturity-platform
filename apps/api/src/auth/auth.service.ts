import { randomUUID } from 'crypto';

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';

import { PrismaService } from '../prisma/prisma.service';

import { LoginDto } from './dto/login.dto';

export interface JwtPayload {
  sub: string;
  email: string;
  name: string;
  tenantId: string;
  organisationId: string | null;
  role: string;
  roles: string[];
  /** Unique per issued token — the only thing logout needs to revoke *this* token without touching any other session. */
  jti: string;
}

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
  ) {}

  async login(loginDto: LoginDto) {
    const user = await this.prisma.user.findFirst({
      where: { email: loginDto.email, isActive: true, deletedAt: null },
      include: { userRoleAssignments: true },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordValid = await bcrypt.compare(loginDto.password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    const roles = user.userRoleAssignments
      .filter((assignment) => !assignment.deletedAt)
      .map((assignment) => assignment.role);

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      tenantId: user.tenantId,
      organisationId: user.organisationId,
      role: roles[0] ?? 'READ_ONLY_VIEWER',
      roles,
      jti: randomUUID(),
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        tenantId: user.tenantId,
        organisationId: user.organisationId,
        role: payload.role,
        roles,
      },
    };
  }

  async validateToken(token: string): Promise<JwtPayload & { exp: number }> {
    try {
      return this.jwtService.verify<JwtPayload & { exp: number }>(token);
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }

  /**
   * Revokes exactly the token being logged out of — every other session
   * for this user (a different device, a different tab that hasn't
   * logged out) keeps working, which is the expected behaviour for
   * per-token logout rather than a global "sign out everywhere."
   * `expiresAt` mirrors the token's own `exp` claim: once it passes, the
   * token would be rejected on expiry alone, so the row is safe to prune
   * after that point (no pruning job exists yet — see
   * docs/security-architecture.md).
   */
  async logout(jti: string, expiresAt: Date) {
    await this.prisma.revokedToken.upsert({
      where: { jti },
      create: { jti, expiresAt },
      update: {},
    });
    return { message: 'Logged out successfully' };
  }

  async isRevoked(jti: string): Promise<boolean> {
    const revoked = await this.prisma.revokedToken.findUnique({ where: { jti } });
    return revoked !== null;
  }

  /**
   * Mints a new token AND revokes the one this call was made with, so a
   * leaked token can't go on being used indefinitely just because its
   * holder happens to refresh regularly — the old jti stops working the
   * instant the new one exists, same as logout.
   */
  async refreshToken(token: string) {
    const payload = await this.validateToken(token);
    const rest: JwtPayload = {
      sub: payload.sub,
      email: payload.email,
      name: payload.name,
      tenantId: payload.tenantId,
      organisationId: payload.organisationId,
      role: payload.role,
      roles: payload.roles,
      jti: randomUUID(),
    };
    const newToken = this.jwtService.sign(rest);
    await this.logout(payload.jti, new Date(payload.exp * 1000));
    return { access_token: newToken };
  }
}
