import { UserRole } from '@cmmp/shared';
import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { AuditLog } from '../audit/decorators/audit-log.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { RequestUser } from '../auth/types/authenticated-request';

import { CreatePinnedInsightDto } from './dto/create-pinned-insight.dto';
import { PinnedInsightsService } from './pinned-insights.service';

const PINNED_INSIGHT_WRITE_ROLES = [
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
 * Charts explicitly "pinned" from the Data Analysis page onto the tenant's shared dashboard —
 * see apps/web/pages/dashboard.tsx and apps/api/src/data-analysis. Any authenticated user can
 * view what's pinned; pinning/unpinning is gated the same as other dashboard-visible writes
 * (risks, control mappings).
 */
@ApiTags('Pinned Insights')
@ApiBearerAuth()
@Controller('pinned-insights')
@UseGuards(JwtAuthGuard)
export class PinnedInsightsController {
  constructor(private readonly pinnedInsightsService: PinnedInsightsService) {}

  @Get()
  async findAll(@CurrentUser() user: RequestUser, @Query('organisationId') organisationId?: string) {
    return this.pinnedInsightsService.findAllForOrganisation(user.tenantId, requireOrganisationId(organisationId));
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(...PINNED_INSIGHT_WRITE_ROLES)
  @AuditLog('CREATE', 'PinnedInsight')
  async create(@Body() dto: CreatePinnedInsightDto, @CurrentUser() user: RequestUser) {
    return this.pinnedInsightsService.create(user.tenantId, user.sub, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(...PINNED_INSIGHT_WRITE_ROLES)
  @AuditLog('DELETE', 'PinnedInsight')
  async remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    await this.pinnedInsightsService.remove(user.tenantId, id);
    return { message: 'Removed' };
  }
}
