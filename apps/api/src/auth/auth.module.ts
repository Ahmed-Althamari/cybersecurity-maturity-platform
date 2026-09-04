import { Logger, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { PrismaModule } from '../prisma/prisma.module';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';

const FALLBACK_SECRET = 'your-secret-key-change-in-production';

/**
 * A JWT_SECRET fallback baked into the public source tree is only a real
 * vulnerability once it's actually signing tokens someone might rely on —
 * i.e. in production. Refuse to start rather than silently sign every
 * token with a value anyone can read on GitHub; local dev/CI keep the
 * fallback (with a loud warning) so this doesn't force every environment
 * to configure a secret just to run the test suite.
 */
export function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret) {
    return secret;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set in production — refusing to start with the public fallback value.');
  }
  new Logger('AuthModule').warn('JWT_SECRET is not set — using an insecure fallback value. Set JWT_SECRET before deploying.');
  return FALLBACK_SECRET;
}

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: resolveJwtSecret(),
      signOptions: { expiresIn: '24h' },
    }),
    PrismaModule,
  ],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
