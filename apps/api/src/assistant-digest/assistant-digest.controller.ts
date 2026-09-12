import { UserRole } from '@cmmp/shared';
import { BadRequestException, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { AuditLog } from '../audit/decorators/audit-log.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { RequestUser } from '../auth/types/authenticated-request';

import { AssistantDigestService } from './assistant-digest.service';

export const DIGEST_MANAGE_ROLES = [
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
 * The scheduled digest's history and manual trigger — see AssistantDigestService for the daily
 * cron. Any authenticated user can view an organisation's digest history; triggering a fresh one
 * on demand is gated the same as other AI-configuration writes, since it can incur an AI call.
 */
@ApiTags('Assistant Digest')
@ApiBearerAuth()
@Controller('assistant-digests')
@UseGuards(JwtAuthGuard)
export class AssistantDigestController {
  constructor(private readonly assistantDigestService: AssistantDigestService) {}

  @Get()
  async findAll(@CurrentUser() user: RequestUser, @Query('organisationId') organisationId?: string) {
    return this.assistantDigestService.listForOrganisation(user.tenantId, requireOrganisationId(organisationId));
  }

  @Post(':organisationId/generate')
  @UseGuards(RolesGuard)
  @Roles(...DIGEST_MANAGE_ROLES)
  @AuditLog('CREATE', 'AssistantDigest')
  async generate(@Param('organisationId') organisationId: string, @CurrentUser() user: RequestUser) {
    return this.assistantDigestService.generateForOrganisation(user.tenantId, organisationId);
  }
}
