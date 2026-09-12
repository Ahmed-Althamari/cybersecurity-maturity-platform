import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import type { CreateAssistantNoteDto } from './dto/create-assistant-note.dto';

/**
 * Short pieces of standing context a user explicitly saves ("we treat vendor risk as high
 * priority") for the AI features to draw on — see AssistantDigestService, which reads these back
 * when generating a digest's AI summary. Never written automatically by an AI call, same
 * "explicit action only" convention as PinnedInsight.
 */
@Injectable()
export class AssistantNotesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllForOrganisation(tenantId: string, organisationId: string) {
    return this.prisma.assistantNote.findMany({
      where: { tenantId, organisationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(tenantId: string, userId: string, dto: CreateAssistantNoteDto) {
    const organisation = await this.prisma.organisation.findFirst({ where: { id: dto.organisationId, tenantId } });
    if (!organisation) {
      throw new NotFoundException('Organisation not found for this tenant');
    }

    return this.prisma.assistantNote.create({
      data: {
        tenantId,
        organisationId: dto.organisationId,
        content: dto.content,
        createdById: userId,
      },
    });
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const { count } = await this.prisma.assistantNote.deleteMany({ where: { id, tenantId } });
    if (count === 0) {
      throw new NotFoundException('Assistant note not found');
    }
  }
}
