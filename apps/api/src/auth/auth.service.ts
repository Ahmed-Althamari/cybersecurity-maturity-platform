import { randomUUID } from 'crypto';

import { AuditAction } from '@cmmp/shared';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';

import { AuditService } from '../audit/audit.service';
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
  // Unique per issued token -- the revocation list (RevokedToken) key.
  // See JwtStrategy.validate() for where this is actually enforced.
  jti: string;
}

// What's actually available on a verified/decoded token (request.user, or
// jsonwebtoken.verify()'s return value) -- `iat`/`exp` are added by
// @nestjs/jwt at sign/verify time, not part of the payload we construct
// ourselves before signing.
export type VerifiedJwtPayload = JwtPayload & { iat: number; exp: number };

export interface RequestContext {
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  async login(loginDto: LoginDto, context: RequestContext = {}) {
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

    await this.auditService.log({
      tenantId: user.tenantId,
      userId: user.id,
      action: AuditAction.LOGIN,
      resource: 'Auth',
      resourceId: user.id,
      description: `${user.email} logged in`,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

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

  async validateToken(token: string): Promise<JwtPayload> {
    try {
      return this.jwtService.verify<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }

  async logout(user: JwtPayload & { exp?: number }, context: RequestContext = {}) {
    if (user.exp) {
      await this.revokeToken(user.jti, user.tenantId, user.sub, new Date(user.exp * 1000));
    }
    await this.auditService.log({
      tenantId: user.tenantId,
      userId: user.sub,
      action: AuditAction.LOGOUT,
      resource: 'Auth',
      resourceId: user.sub,
      description: `${user.email} logged out`,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
    return { message: 'Logged out successfully' };
  }

  async refreshToken(token: string) {
    const payload = await this.validateToken(token);
    const { iat, exp, jti, ...rest } = payload as VerifiedJwtPayload;

    // Rotate: the presented token is revoked the moment it's exchanged, so
    // it can't be replayed even though it hasn't reached its own expiry --
    // "refresh" was previously just a re-sign that left the old token
    // valid until its own 24h expiry too (see docs/threat-model.md).
    await this.revokeToken(jti, rest.tenantId, rest.sub, new Date(exp * 1000));

    const newToken = this.jwtService.sign({ ...rest, jti: randomUUID() });
    return { access_token: newToken };
  }

  private async revokeToken(jti: string, tenantId: string, userId: string, expiresAt: Date) {
    // upsert, not create: a double-logout (retry, double-click) or two
    // concurrent /auth/refresh calls racing to revoke the same jti must be
    // idempotent, not a 500 from a unique-constraint violation on `jti @id`.
    await this.prisma.revokedToken.upsert({
      where: { jti },
      create: { jti, tenantId, userId, expiresAt },
      update: {},
    });
    // Opportunistic cleanup -- a row past its own token's expiry would
    // already be rejected by JwtStrategy's own expiration check regardless,
    // so it's provably dead weight. Avoids needing a separate cleanup job
    // for what's expected to stay a small table.
    await this.prisma.revokedToken.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  }
}
