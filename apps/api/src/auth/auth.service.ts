import { randomUUID } from 'crypto';

import { AuditAction } from '@cmmp/shared';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';

import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import type { AuthenticatedUser } from './types/authenticated-user';

const SALT_ROUNDS = 12;

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
  // Millisecond-precision issue time, set explicitly at sign time here --
  // deliberately *not* the standard `iat` claim, which @nestjs/jwt derives
  // itself at second precision. JwtStrategy compares this against the
  // user's passwordChangedAt (also millisecond-precision) to decide
  // whether a token predates their last password change; `iat`'s 1-second
  // resolution isn't fine enough to make that call correctly for a token
  // issued in the same wall-clock second as the change (confirmed by a
  // real, intermittent integration-test failure under fast/parallel
  // execution before this field existed). Optional only so existing call
  // sites/tests that don't care about password-change revocation (e.g.
  // logout's already-narrower payload) don't need to fabricate one.
  issuedAtMs?: number;
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
      issuedAtMs: Date.now(),
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

    const newToken = this.jwtService.sign({ ...rest, jti: randomUUID(), issuedAtMs: Date.now() });
    return { access_token: newToken };
  }

  async changePassword(user: AuthenticatedUser, dto: ChangePasswordDto, context: RequestContext = {}) {
    const record = await this.prisma.user.findFirst({
      where: { id: user.sub, tenantId: user.tenantId, isActive: true, deletedAt: null },
    });
    if (!record || !record.passwordHash) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const currentPasswordValid = await bcrypt.compare(dto.currentPassword, record.passwordHash);
    if (!currentPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const newPasswordHash = await bcrypt.hash(dto.newPassword, SALT_ROUNDS);
    await this.prisma.user.update({
      where: { id: record.id },
      data: { passwordHash: newPasswordHash, passwordChangedAt: new Date() },
    });

    await this.auditService.log({
      tenantId: user.tenantId,
      userId: user.sub,
      action: AuditAction.UPDATE,
      resource: 'Auth',
      resourceId: user.sub,
      description: `${user.email} changed their password`,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    // Every token issued before the passwordChangedAt write above --
    // including the one used to make this very request -- is now rejected
    // by JwtStrategy's passwordChangedAt check (see that file), so a fresh
    // one is minted here for the caller. Any other outstanding token (a
    // stolen/leaked one, a session on another device) is now dead: this is
    // what "changing your password logs out every other session" means in
    // a stateless-JWT system with no per-session token table to enumerate.
    const newToken = this.jwtService.sign({
      sub: user.sub,
      email: user.email,
      name: user.name,
      tenantId: user.tenantId,
      organisationId: user.organisationId,
      role: user.role,
      roles: user.roles,
      jti: randomUUID(),
      issuedAtMs: Date.now(),
    });

    return { access_token: newToken, message: 'Password changed successfully' };
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
