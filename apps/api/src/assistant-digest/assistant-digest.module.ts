import { Module } from '@nestjs/common';

import { AssistantNotesModule } from '../assistant-notes/assistant-notes.module';
import { LlmSettingsModule } from '../llm-settings/llm-settings.module';
import { MailModule } from '../mail/mail.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';

import { AssistantDigestController } from './assistant-digest.controller';
import { AssistantDigestService } from './assistant-digest.service';

@Module({
  imports: [PrismaModule, NotificationsModule, AssistantNotesModule, LlmSettingsModule, MailModule],
  providers: [AssistantDigestService],
  controllers: [AssistantDigestController],
  exports: [AssistantDigestService],
})
export class AssistantDigestModule {}
