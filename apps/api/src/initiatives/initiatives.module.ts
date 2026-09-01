import { Module } from '@nestjs/common';
import { InitiativesService } from './initiatives.service';
import { InitiativesController } from './initiatives.controller';
import { RoadmapController } from './roadmap.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AssessmentsModule } from '../assessments/assessments.module';
import { ScoringModule } from '../scoring/scoring.module';

@Module({
  imports: [PrismaModule, AssessmentsModule, ScoringModule],
  providers: [InitiativesService],
  controllers: [InitiativesController, RoadmapController],
  exports: [InitiativesService],
})
export class InitiativesModule {}
