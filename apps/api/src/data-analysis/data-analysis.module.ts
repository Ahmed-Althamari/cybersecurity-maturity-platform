import { Module } from '@nestjs/common';

import { LlmSettingsModule } from '../llm-settings/llm-settings.module';

import { DataAnalysisController } from './data-analysis.controller';
import { DataAnalysisService } from './data-analysis.service';

@Module({
  imports: [LlmSettingsModule],
  controllers: [DataAnalysisController],
  providers: [DataAnalysisService],
})
export class DataAnalysisModule {}
