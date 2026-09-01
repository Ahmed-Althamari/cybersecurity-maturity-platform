import { Module } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AssessmentsModule } from '../assessments/assessments.module';
import { ScoringModule } from '../scoring/scoring.module';

@Module({
  imports: [PrismaModule, AssessmentsModule, ScoringModule],
  providers: [DashboardService],
  controllers: [DashboardController],
})
export class DashboardModule {}
