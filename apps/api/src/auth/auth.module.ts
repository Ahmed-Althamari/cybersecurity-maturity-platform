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
    // registerAsync, not register: a plain `register({ secret: resolveJwtSecret() })` call
    // evaluates its argument object at module-DECORATION time -- i.e. as soon as this file is
    // imported, which for AuthModule happens while app.module.ts's own static imports are still
    // resolving, before its `ConfigModule.forRoot(...)` entry ever runs. JwtStrategy's
    // constructor, by contrast, only runs later, once Nest actually instantiates that provider
    // during NestFactory.create() -- well after ConfigModule's dotenv side effect has populated
    // process.env. The two calls to resolveJwtSecret() would then disagree the moment JWT_SECRET
    // is supplied only via a .env file (never set as a real process/shell env var before Node
    // starts): tokens get signed with one secret and verified with another, so every login
    // succeeds but every subsequent authenticated request 401s. registerAsync's factory isn't
    // invoked until that same later DI-instantiation phase, matching JwtStrategy's timing exactly.
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: resolveJwtSecret(),
        signOptions: { expiresIn: '24h' },
      }),
    }),
    PrismaModule,
  ],
  providers: [AuthService, JwtStrategy, RevokedTokenCleanupService],
  controllers: [AuthController],
  exports: [AuthService, JwtModule, PassportModule],
})
export class AuthModule {}
