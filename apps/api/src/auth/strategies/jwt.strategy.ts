import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { PrismaService } from '../../prisma/prisma.service';
import type { JwtPayload } from '../auth.service';
import { AuthService } from '../auth.service';
import { resolveJwtSecret } from '../jwt-secret';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private authService: AuthService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: resolveJwtSecret(),
    });
  }

  async validate(payload: JwtPayload & { exp: number }) {
    const [revoked, user] = await Promise.all([
      this.authService.isRevoked(payload.jti),
      this.prisma.user.findUnique({ where: { id: payload.sub }, select: { passwordChangedAt: true } }),
    ]);
    if (revoked) {
      throw new UnauthorizedException('Token has been revoked');
    }

    // There's no per-session token table to individually revoke every
    // outstanding token on a password change, so instead: any token issued
    // before the user's last password change is rejected wholesale (see
    // AuthService.changePassword). Uses the custom millisecond-precision
    // `issuedAtMs` claim rather than the standard `iat` (only second-
    // precision) — a token issued in the same wall-clock second as the
    // change would otherwise be impossible to order correctly against it.
    // A token with no `issuedAtMs` at all (minted before this feature
    // existed) can't be compared, so it's let through this specific check
    // — still subject to the jti-based revocation above.
    if (user?.passwordChangedAt && payload.issuedAtMs !== undefined && payload.issuedAtMs < user.passwordChangedAt.getTime()) {
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
