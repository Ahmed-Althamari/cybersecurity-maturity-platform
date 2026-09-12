import { UserRole } from '@cmmp/shared';
import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { AuditLog } from '../audit/decorators/audit-log.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { RequestUser } from '../auth/types/authenticated-request';

import { AssistantNotesService } from './assistant-notes.service';
import { CreateAssistantNoteDto } from './dto/create-assistant-note.dto';

export const ASSISTANT_NOTE_WRITE_ROLES = [
  UserRole.PLATFORM_ADMIN,
  UserRole.ORGANISATION_ADMIN,
  UserRole.CISO,
  UserRole.GRC_MANAGER,
  UserRole.SECURITY_ARCHITECT,
];

function requireOrganisationId(organisationId: string | undefined): string {
  if (!organisationId) {
    throw new BadRequestException('organisationId query parameter is required');
  }
  return organisationId;
}

/**
 * Standing context notes for the AI Assisted features — see apps/api/src/assistant-digest, which
 * feeds these into a digest's AI summary. Any authenticated user can view what's saved;
 * adding/removing is gated the same as other AI-configuration writes.
 */
@ApiTags('Assistant Notes')
@ApiBearerAuth()
@Controller('assistant-notes')
@UseGuards(JwtAuthGuard)
export class AssistantNotesController {
  constructor(private readonly assistantNotesService: AssistantNotesService) {}

  @Get()
  async findAll(@CurrentUser() user: RequestUser, @Query('organisationId') organisationId?: string) {
    return this.assistantNotesService.findAllForOrganisation(user.tenantId, requireOrganisationId(organisationId));
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(...ASSISTANT_NOTE_WRITE_ROLES)
  @AuditLog('CREATE', 'AssistantNote')
  async create(@Body() dto: CreateAssistantNoteDto, @CurrentUser() user: RequestUser) {
    return this.assistantNotesService.create(user.tenantId, user.sub, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(...ASSISTANT_NOTE_WRITE_ROLES)
  @AuditLog('DELETE', 'AssistantNote')
  async remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    await this.assistantNotesService.remove(user.tenantId, id);
    return { message: 'Removed' };
  }
}
