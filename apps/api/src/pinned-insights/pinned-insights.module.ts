import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';

import { PinnedInsightsController } from './pinned-insights.controller';
import { PinnedInsightsService } from './pinned-insights.service';

@Module({
  imports: [PrismaModule],
  providers: [PinnedInsightsService],
  controllers: [PinnedInsightsController],
  exports: [PinnedInsightsService],
})
export class PinnedInsightsModule {}
