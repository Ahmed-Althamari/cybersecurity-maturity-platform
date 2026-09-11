import { Module } from '@nestjs/common';

import { LlmSettingsModule } from '../llm-settings/llm-settings.module';
import { PrismaModule } from '../prisma/prisma.module';

import { AssessmentsController } from './assessments.controller';
import { AssessmentsService } from './assessments.service';
import { ImportMappingSuggesterService } from './import-mapping/mapping-suggester.service';

@Module({
  imports: [PrismaModule, LlmSettingsModule],
  providers: [AssessmentsService, ImportMappingSuggesterService],
  controllers: [AssessmentsController],
  exports: [AssessmentsService],
})
export class AssessmentsModule {}
