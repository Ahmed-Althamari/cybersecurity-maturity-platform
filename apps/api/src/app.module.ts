import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AssessmentsModule } from './assessments/assessments.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { FrameworkModule } from './framework/framework.module';
import { HealthModule } from './health/health.module';
import { ImportModule } from './import/import.module';
import { InitiativesModule } from './initiatives/initiatives.module';
import { PrismaModule } from './prisma/prisma.module';
import { RisksModule } from './risks/risks.module';
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
    FrameworkModule,
    AssessmentsModule,
    ImportModule,
    DashboardModule,
    RisksModule,
    InitiativesModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
