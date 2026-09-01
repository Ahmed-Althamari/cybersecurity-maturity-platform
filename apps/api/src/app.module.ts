import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { FrameworkModule } from './framework/framework.module';
import { AssessmentsModule } from './assessments/assessments.module';
import { ImportModule } from './import/import.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { RisksModule } from './risks/risks.module';
import { InitiativesModule } from './initiatives/initiatives.module';
import { AuditModule } from './audit/audit.module';
import { HealthModule } from './health/health.module';

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
