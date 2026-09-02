import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { PrismaService } from '../../prisma/prisma.service';
import type { VerifiedJwtPayload } from '../auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') || 'your-secret-key-change-in-production',
    });
  }

  async validate(payload: VerifiedJwtPayload) {
    // Checked on every authenticated request -- see RevokedToken/AuthService
    // for where rows here get created (logout, /auth/refresh rotation).
    // Signature and expiry are already verified by the time this runs
    // (passport-jwt's own job); this is the one check that can't be done
    // from the token's contents alone.
    const revoked = await this.prisma.revokedToken.findUnique({ where: { jti: payload.jti } });
    if (revoked) {
      throw new UnauthorizedException('Token has been revoked');
    }

    return {
      sub: payload.sub,
      email: payload.email,
      name: payload.name,
      tenantId: payload.tenantId,
      organisationId: payload.organisationId,
      role: payload.role,
      roles: payload.roles,
      jti: payload.jti,
      exp: payload.exp,
    };
  }
}
