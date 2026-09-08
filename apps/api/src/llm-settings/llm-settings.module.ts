import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';

import { LlmSettingsController } from './llm-settings.controller';
import { LlmSettingsService } from './llm-settings.service';

@Module({
  imports: [PrismaModule],
  controllers: [LlmSettingsController],
  providers: [LlmSettingsService],
  exports: [LlmSettingsService],
})
export class LlmSettingsModule {}
