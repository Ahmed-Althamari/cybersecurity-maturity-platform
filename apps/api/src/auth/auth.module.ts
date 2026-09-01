import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../prisma/prisma.module';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';


@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
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
