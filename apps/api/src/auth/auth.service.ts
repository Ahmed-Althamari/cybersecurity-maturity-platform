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
}

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

  async logout(user: JwtPayload, context: RequestContext = {}) {
    // Token-based auth doesn't require server-side logout.
    // A revocation list can be added here if immediate token invalidation is needed.
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
    const { iat, exp, ...rest } = payload as JwtPayload & { iat?: number; exp?: number };
    const newToken = this.jwtService.sign(rest);
    return { access_token: newToken };
  }
}
