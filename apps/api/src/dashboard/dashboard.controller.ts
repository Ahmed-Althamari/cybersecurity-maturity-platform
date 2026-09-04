import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { RequestUser } from '../auth/types/authenticated-request';

import { DashboardService } from './dashboard.service';

function requireOrganisationId(organisationId: string | undefined): string {
  if (!organisationId) {
    throw new BadRequestException('organisationId query parameter is required');
  }
  return organisationId;
}

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  @Get('maturity')
  async getMaturity(
    @CurrentUser() user: RequestUser,
    @Query('organisationId') organisationId?: string,
    @Query('assessmentId') assessmentId?: string,
  ) {
    return this.dashboardService.getMaturityOverview(user.tenantId, requireOrganisationId(organisationId), assessmentId);
  }

  @Get('functions')
  async getFunctions(
    @CurrentUser() user: RequestUser,
    @Query('organisationId') organisationId?: string,
    @Query('assessmentId') assessmentId?: string,
    @Query('compareToAssessmentId') compareToAssessmentId?: string,
  ) {
    return this.dashboardService.getFunctionMaturity(
      user.tenantId,
      requireOrganisationId(organisationId),
      assessmentId,
      compareToAssessmentId,
    );
  }

  @Get('gaps')
  async getGaps(
    @CurrentUser() user: RequestUser,
    @Query('organisationId') organisationId?: string,
    @Query('assessmentId') assessmentId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.dashboardService.getGapAnalysis(
      user.tenantId,
      requireOrganisationId(organisationId),
      assessmentId,
      limit !== undefined ? Number(limit) : undefined,
    );
  }

  @Get('risks')
  async getRisks(
    @CurrentUser() user: RequestUser,
    @Query('organisationId') organisationId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.dashboardService.getRiskSummary(user.tenantId, requireOrganisationId(organisationId), limit !== undefined ? Number(limit) : undefined);
  }

  @Get('roadmap')
  async getRoadmap(@CurrentUser() user: RequestUser, @Query('organisationId') organisationId?: string) {
    return this.dashboardService.getRoadmapStatus(user.tenantId, requireOrganisationId(organisationId));
  }

  @Get('executive')
  async getExecutive(
    @CurrentUser() user: RequestUser,
    @Query('organisationId') organisationId?: string,
    @Query('assessmentId') assessmentId?: string,
  ) {
    return this.dashboardService.getExecutiveSummary(user.tenantId, requireOrganisationId(organisationId), assessmentId);
  }
}
