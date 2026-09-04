import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AssessmentsModule } from './assessments/assessments.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { FrameworksModule } from './frameworks/frameworks.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { RemediationInitiativesModule } from './remediation-initiatives/remediation-initiatives.module';
import { RisksModule } from './risks/risks.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    // Global default: generous, general-purpose abuse protection. Individual routes (login,
    // notably — see AuthController) override this with a much tighter @Throttle() limit of
    // their own; the health endpoint opts out entirely via @SkipThrottle() since it's designed
    // for frequent, automated polling.
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: Number(process.env.RATE_LIMIT_WINDOW_MS) || 900_000,
        limit: Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
      },
    ]),
    PrismaModule,
    HealthModule,
    AuditModule,
    AuthModule,
    UsersModule,
    FrameworksModule,
    AssessmentsModule,
    DashboardModule,
    RisksModule,
    RemediationInitiativesModule,
  ],
  controllers: [],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
