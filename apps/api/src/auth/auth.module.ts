import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { PrismaModule } from '../prisma/prisma.module';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { resolveJwtSecret } from './jwt-secret';
import { RevokedTokenCleanupService } from './revoked-token-cleanup.service';
import { JwtStrategy } from './strategies/jwt.strategy';

// @Global(): every feature module that guards a route with JwtAuthGuard
// (`@UseGuards(JwtAuthGuard)`) needs PassportModule's AuthModuleOptions
// provider visible to it — see the comment on PassportModule below for why.
// Global-scoping AuthModule (once, here) rather than importing PassportModule
// piecemeal into every feature module is what makes that visibility
// unconditional, regardless of which module NestJS's DI container happens to
// resolve JwtAuthGuard's shared singleton instance through.
@Global()
@Module({
  imports: [
    // JwtAuthGuard (auth/guards/jwt-auth.guard.ts) is `AuthGuard('jwt')` from
    // @nestjs/passport, applied via @UseGuards() with no explicit provider
    // registration of its own. Since it's otherwise unbound to any one
    // module, Nest's DI container resolves its single shared instance
    // through whichever module it first encounters across the whole app —
    // and that guard's (@Optional()) constructor dependency on
    // AuthModuleOptions (PassportModule.register()'s provider) must resolve
    // wherever that turns out to be, or every JwtAuthGuard-protected route
    // in the app fails to boot with "Nest can't resolve dependencies of the
    // JwtAuthGuard". Exporting PassportModule from this @Global() module is
    // what makes AuthModuleOptions reachable no matter which module ends up
    // "owning" that shared instance.
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: resolveJwtSecret(),
      signOptions: { expiresIn: '24h' },
    }),
    PrismaModule,
  ],
  providers: [AuthService, JwtStrategy, RevokedTokenCleanupService],
  controllers: [AuthController],
  exports: [AuthService, JwtModule, PassportModule],
})
export class AuthModule {}
