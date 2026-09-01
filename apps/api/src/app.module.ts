import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { FrameworkModule } from './framework/framework.module';
import { AssessmentsModule } from './assessments/assessments.module';
import { ImportModule } from './import/import.module';
import { DashboardModule } from './dashboard/dashboard.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    FrameworkModule,
    AssessmentsModule,
    ImportModule,
    DashboardModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
