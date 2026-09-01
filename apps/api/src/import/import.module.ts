import { Module } from '@nestjs/common';

import { AssessmentsModule } from '../assessments/assessments.module';
import { PrismaModule } from '../prisma/prisma.module';

import { AiMappingService } from './ai-mapping.service';
import { ImportController } from './import.controller';
import { ImportService } from './import.service';

@Module({
  imports: [PrismaModule, AssessmentsModule],
  providers: [ImportService, AiMappingService],
  controllers: [ImportController],
})
export class ImportModule {}
