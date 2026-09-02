import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';

import { AssessmentsModule } from './assessments/assessments.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { GlobalRateLimitGuard } from './common/global-rate-limit.guard';
import { DashboardModule } from './dashboard/dashboard.module';
import { FrameworkModule } from './framework/framework.module';
import { HealthModule } from './health/health.module';
import { ImportModule } from './import/import.module';
import { InitiativesModule } from './initiatives/initiatives.module';
import { PrismaModule } from './prisma/prisma.module';
import { RisksModule } from './risks/risks.module';
import { SettingsModule } from './settings/settings.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    PrismaModule,
    HealthModule,
    AuditModule,
    AuthModule,
    UsersModule,
    SettingsModule,
    FrameworkModule,
    AssessmentsModule,
    ImportModule,
    DashboardModule,
    RisksModule,
    InitiativesModule,
  ],
  controllers: [],
  providers: [
    // Generic, API-wide request budget (RATE_LIMIT_WINDOW_MS/
    // RATE_LIMIT_MAX_REQUESTS/ENABLE_RATE_LIMITING) -- separate from
    // AuthModule's own AUTH_RATE_LIMIT_WINDOW_MS/AUTH_RATE_LIMIT_MAX_ATTEMPTS,
    // which is unchanged (its own ThrottlerModule registration, applied
    // only via @UseGuards(ThrottlerGuard) on the login/refresh handlers).
    // Deliberately NOT built on @nestjs/throttler a second time: a first
    // attempt registering a second ThrottlerModule.forRootAsync() here
    // (with its own ThrottlerGuard as APP_GUARD) silently broke the
    // existing login throttle -- confirmed live, not assumed -- because
    // @nestjs/throttler's options/storage providers aren't module-scoped
    // the way plain Nest DI usually is, so the second registration
    // clobbered the first's config application-wide (the login test's
    // 6th request, expected to 429, kept getting 401 -- the auth throttle
    // had silently stopped firing). GlobalRateLimitGuard is a small,
    // self-contained, in-memory guard with zero dependency on that
    // library's shared internals, so it can't collide with it.
    { provide: APP_GUARD, useClass: GlobalRateLimitGuard },
  ],
})
export class AppModule {}
