import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';

import { AssistantNotesController } from './assistant-notes.controller';
import { AssistantNotesService } from './assistant-notes.service';

@Module({
  imports: [PrismaModule],
  providers: [AssistantNotesService],
  controllers: [AssistantNotesController],
  exports: [AssistantNotesService],
})
export class AssistantNotesModule {}
