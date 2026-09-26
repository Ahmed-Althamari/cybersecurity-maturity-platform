import { UserRole } from '@cmmp/shared';
import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { AuditLog } from '../audit/decorators/audit-log.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { RequestUser } from '../auth/types/authenticated-request';

import { CreateMilestoneDto } from './dto/create-milestone.dto';
import { CreateStrategicInitiativeDto } from './dto/create-strategic-initiative.dto';
import { RecordProgressDto } from './dto/record-progress.dto';
import { UpdateMilestoneDto } from './dto/update-milestone.dto';
import { UpdateStrategicInitiativeDto } from './dto/update-strategic-initiative.dto';
import { StrategicInitiativesService } from './strategic-initiatives.service';

const STRATEGIC_WRITE_ROLES = [
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

@ApiTags('Strategic Initiatives')
@ApiBearerAuth()
@Controller('strategic-initiatives')
@UseGuards(JwtAuthGuard)
export class StrategicInitiativesController {
  constructor(private strategicInitiativesService: StrategicInitiativesService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(...STRATEGIC_WRITE_ROLES)
  @AuditLog('CREATE', 'StrategicInitiative')
  async create(@Body() dto: CreateStrategicInitiativeDto, @CurrentUser() user: RequestUser) {
    return this.strategicInitiativesService.create(user.tenantId, dto);
  }

  // Declared before ':id' so Nest doesn't try to resolve "dashboard" as an initiative id.
  @Get('dashboard')
  async getDashboard(@CurrentUser() user: RequestUser, @Query('organisationId') organisationId?: string) {
    return this.strategicInitiativesService.getDashboard(user.tenantId, requireOrganisationId(organisationId));
  }

  @Get()
  async findAll(
    @CurrentUser() user: RequestUser,
    @Query('organisationId') organisationId?: string,
    @Query('status') status?: string,
    @Query('owner') owner?: string,
    @Query('strategicObjective') strategicObjective?: string,
    @Query('priority') priority?: string,
    @Query('riskLevel') riskLevel?: string,
    @Query('linked') linked?: 'true' | 'false',
    @Query('year') year?: string,
    @Query('month') month?: string,
    @Query('search') search?: string,
    @Query('sort') sort?: 'priority' | 'recent' | 'targetDate',
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.strategicInitiativesService.findAll(user.tenantId, requireOrganisationId(organisationId), {
      status,
      owner,
      strategicObjective,
      priority: priority ? Number(priority) : undefined,
      riskLevel,
      linked,
      year: year ? Number(year) : undefined,
      month: month ? Number(month) : undefined,
      search,
      sort,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.strategicInitiativesService.findOne(id, user.tenantId);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(...STRATEGIC_WRITE_ROLES)
  @AuditLog('UPDATE', 'StrategicInitiative')
  async update(@Param('id') id: string, @Body() dto: UpdateStrategicInitiativeDto, @CurrentUser() user: RequestUser) {
    return this.strategicInitiativesService.update(id, user.tenantId, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.ORGANISATION_ADMIN)
  @AuditLog('DELETE', 'StrategicInitiative')
  async remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.strategicInitiativesService.remove(id, user.tenantId);
  }

  @Post(':id/risks/:riskId')
  @UseGuards(RolesGuard)
  @Roles(...STRATEGIC_WRITE_ROLES)
  @AuditLog('UPDATE', 'StrategicInitiative')
  async linkRisk(@Param('id') id: string, @Param('riskId') riskId: string, @CurrentUser() user: RequestUser) {
    return this.strategicInitiativesService.linkRisk(id, user.tenantId, riskId);
  }

  @Delete(':id/risks/:riskId')
  @UseGuards(RolesGuard)
  @Roles(...STRATEGIC_WRITE_ROLES)
  @AuditLog('UPDATE', 'StrategicInitiative')
  async unlinkRisk(@Param('id') id: string, @Param('riskId') riskId: string, @CurrentUser() user: RequestUser) {
    return this.strategicInitiativesService.unlinkRisk(id, user.tenantId, riskId);
  }

  @Post(':id/milestones')
  @UseGuards(RolesGuard)
  @Roles(...STRATEGIC_WRITE_ROLES)
  @AuditLog('CREATE', 'StrategicMilestone')
  async addMilestone(@Param('id') id: string, @Body() dto: CreateMilestoneDto, @CurrentUser() user: RequestUser) {
    return this.strategicInitiativesService.addMilestone(id, user.tenantId, dto);
  }

  @Patch(':id/milestones/:milestoneId')
  @UseGuards(RolesGuard)
  @Roles(...STRATEGIC_WRITE_ROLES)
  @AuditLog('UPDATE', 'StrategicMilestone')
  async updateMilestone(
    @Param('id') id: string,
    @Param('milestoneId') milestoneId: string,
    @Body() dto: UpdateMilestoneDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.strategicInitiativesService.updateMilestone(id, user.tenantId, milestoneId, dto);
  }

  @Delete(':id/milestones/:milestoneId')
  @UseGuards(RolesGuard)
  @Roles(...STRATEGIC_WRITE_ROLES)
  @AuditLog('DELETE', 'StrategicMilestone')
  async removeMilestone(@Param('id') id: string, @Param('milestoneId') milestoneId: string, @CurrentUser() user: RequestUser) {
    return this.strategicInitiativesService.removeMilestone(id, user.tenantId, milestoneId);
  }

  @Post(':id/progress')
  @UseGuards(RolesGuard)
  @Roles(...STRATEGIC_WRITE_ROLES)
  @AuditLog('UPDATE', 'StrategicInitiative')
  async recordProgress(@Param('id') id: string, @Body() dto: RecordProgressDto, @CurrentUser() user: RequestUser) {
    return this.strategicInitiativesService.recordProgress(id, user.tenantId, dto);
  }

  @Delete(':id/progress/:progressId')
  @UseGuards(RolesGuard)
  @Roles(...STRATEGIC_WRITE_ROLES)
  @AuditLog('UPDATE', 'StrategicInitiative')
  async removeProgress(@Param('id') id: string, @Param('progressId') progressId: string, @CurrentUser() user: RequestUser) {
    return this.strategicInitiativesService.removeProgress(id, user.tenantId, progressId);
  }
}
