import { Module } from '@nestjs/common';

import { AssessmentsModule } from '../assessments/assessments.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ScoringModule } from '../scoring/scoring.module';

import { InitiativesController } from './initiatives.controller';
import { InitiativesService } from './initiatives.service';
import { RoadmapController } from './roadmap.controller';


@Module({
  imports: [PrismaModule, AssessmentsModule, ScoringModule],
  providers: [InitiativesService],
  controllers: [InitiativesController, RoadmapController],
  exports: [InitiativesService],
})
export class InitiativesModule {}
