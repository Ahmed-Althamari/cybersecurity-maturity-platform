import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AssessmentsModule } from './assessments/assessments.module';
import { AuthModule } from './auth/auth.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { FrameworksModule } from './frameworks/frameworks.module';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    FrameworksModule,
    AssessmentsModule,
    DashboardModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
