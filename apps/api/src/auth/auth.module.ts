import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerModule } from '@nestjs/throttler';

import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../prisma/prisma.module';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';


@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    // Scoped to this module (not a global APP_GUARD) and only actually
    // applied via @UseGuards(ThrottlerGuard) on AuthController's login/
    // refresh handlers -- see those decorators for why. Deliberately
    // separate env vars from ENABLE_RATE_LIMITING/RATE_LIMIT_WINDOW_MS/
    // RATE_LIMIT_MAX_REQUESTS in .env.example: those describe a generic,
    // API-wide request budget (still unbuilt -- see docs/threat-model.md),
    // a materially different and larger-scope feature than a login-
    // specific brute-force guard. Conflating the two under one variable
    // would silently surprise an operator who tunes one expecting it not
    // to affect the other.
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: Number(config.get<string>('AUTH_RATE_LIMIT_WINDOW_MS')) || 60_000,
          limit: Number(config.get<string>('AUTH_RATE_LIMIT_MAX_ATTEMPTS')) || 20,
        },
      ],
    }),
    // registerAsync + ConfigService, not register({ secret: process.env.JWT_SECRET }):
    // AuthModule is imported (and its @Module() decorator evaluated) while
    // app.module.ts's own top-level imports are still being resolved --
    // before ConfigModule.forRoot() in that same imports array has had a
    // chance to load .env into process.env. A static register() call here
    // would read JWT_SECRET too early and silently fall back to the
    // hardcoded default, while JwtStrategy (an injectable, instantiated
    // later during Nest's bootstrap) would read the real .env value --
    // tokens signed with one secret, verified against another, every
    // authenticated request permanently 401ing whenever a real JWT_SECRET
    // is configured. useFactory defers this read to DI-resolution time,
    // after ConfigModule has actually loaded the file.
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') || 'your-secret-key-change-in-production',
        signOptions: { expiresIn: '24h' },
      }),
    }),
    PrismaModule,
    AuditModule,
  ],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
