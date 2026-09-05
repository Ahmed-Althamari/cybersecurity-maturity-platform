import { Module } from '@nestjs/common';

import { DataAnalysisController } from './data-analysis.controller';
import { DataAnalysisService } from './data-analysis.service';

@Module({
  controllers: [DataAnalysisController],
  providers: [DataAnalysisService],
})
export class DataAnalysisModule {}
