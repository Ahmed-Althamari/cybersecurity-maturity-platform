import { Module } from '@nestjs/common';

import { AssessmentsModule } from '../assessments/assessments.module';
import { PrismaModule } from '../prisma/prisma.module';

import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [PrismaModule, AssessmentsModule],
  providers: [DashboardService],
  controllers: [DashboardController],
})
export class DashboardModule {}
