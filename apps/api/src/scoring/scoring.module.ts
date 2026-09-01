import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';

import { ScoringService } from './scoring.service';

@Module({
  imports: [PrismaModule],
  providers: [ScoringService],
  exports: [ScoringService],
})
export class ScoringModule {}
