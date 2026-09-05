import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';

import { AssessmentsController } from './assessments.controller';
import { AssessmentsService } from './assessments.service';
import { LLM_CLIENT, resolveLlmClient } from './import-mapping/llm-client';
import { ImportMappingSuggesterService } from './import-mapping/mapping-suggester.service';

@Module({
  imports: [PrismaModule],
  providers: [AssessmentsService, ImportMappingSuggesterService, { provide: LLM_CLIENT, useFactory: resolveLlmClient }],
  controllers: [AssessmentsController],
  exports: [AssessmentsService],
})
export class AssessmentsModule {}
