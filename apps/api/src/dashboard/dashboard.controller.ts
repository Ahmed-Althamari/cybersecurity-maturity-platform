import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

import { DashboardService } from './dashboard.service';

@Controller('assessments/:id/dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  @Get()
  async getExecutiveDashboard(@Param('id') id: string, @CurrentUser() user: any) {
    return this.dashboardService.getExecutiveDashboard(user.tenantId, id);
  }

  @Get('maturity-overview')
  async getMaturityOverview(@Param('id') id: string, @CurrentUser() user: any) {
    return this.dashboardService.getMaturityOverview(user.tenantId, id);
  }

  @Get('functions')
  async getFunctionMaturity(@Param('id') id: string, @CurrentUser() user: any) {
    return this.dashboardService.getFunctionMaturity(user.tenantId, id);
  }

  @Get('gaps')
  async getGapAnalysis(
    @Param('id') id: string,
    @Query('minGap') minGap: string | undefined,
    @CurrentUser() user: any,
  ) {
    return this.dashboardService.getGapAnalysis(
      user.tenantId,
      id,
      minGap !== undefined ? Number(minGap) : undefined,
    );
  }

  @Get('heatmap')
  async getMaturityHeatmap(@Param('id') id: string, @CurrentUser() user: any) {
    return this.dashboardService.getMaturityHeatmap(user.tenantId, id);
  }

  @Get('risks')
  async getRiskSummary(@Param('id') id: string, @CurrentUser() user: any) {
    return this.dashboardService.getRiskSummary(user.tenantId, id);
  }

  @Get('roadmap')
  async getRoadmapStatus(@Param('id') id: string, @CurrentUser() user: any) {
    return this.dashboardService.getRoadmapStatus(user.tenantId, id);
  }
}
