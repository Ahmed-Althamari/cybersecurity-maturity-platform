import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AssessmentsModule } from './assessments/assessments.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { ControlMappingsModule } from './control-mappings/control-mappings.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { DataAnalysisModule } from './data-analysis/data-analysis.module';
import { FrameworksModule } from './frameworks/frameworks.module';
import { HealthModule } from './health/health.module';
import { LlmSettingsModule } from './llm-settings/llm-settings.module';
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
    // Registered once, globally, so any module's @Cron() decorator works — currently only
    // AuthModule's RevokedTokenCleanupService uses it.
    ScheduleModule.forRoot(),
    PrismaModule,
    HealthModule,
    AuditModule,
    AuthModule,
    UsersModule,
    FrameworksModule,
    ControlMappingsModule,
    AssessmentsModule,
    DashboardModule,
    RisksModule,
    RemediationInitiativesModule,
    LlmSettingsModule,
    DataAnalysisModule,
  ],
  controllers: [],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
