import { UserRole } from '@cmmp/shared';
import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { AuditLog } from '../audit/decorators/audit-log.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { RequestUser } from '../auth/types/authenticated-request';

import { CreateRemediationInitiativeDto } from './dto/create-remediation-initiative.dto';
import { GenerateFromGapsDto } from './dto/generate-from-gaps.dto';
import { UpdateRemediationInitiativeDto } from './dto/update-remediation-initiative.dto';
import { RemediationInitiativesService } from './remediation-initiatives.service';

const REMEDIATION_WRITE_ROLES = [
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

@ApiTags('Remediation Initiatives')
@ApiBearerAuth()
@Controller('remediation-initiatives')
@UseGuards(JwtAuthGuard)
export class RemediationInitiativesController {
  constructor(private remediationInitiativesService: RemediationInitiativesService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(...REMEDIATION_WRITE_ROLES)
  @AuditLog('CREATE', 'RemediationInitiative')
  async create(@Body() dto: CreateRemediationInitiativeDto, @CurrentUser() user: RequestUser) {
    return this.remediationInitiativesService.create(user.tenantId, dto);
  }

  @Post('generate')
  @UseGuards(RolesGuard)
  @Roles(...REMEDIATION_WRITE_ROLES)
  @AuditLog('CREATE', 'RemediationInitiative')
  async generateFromGaps(@Body() dto: GenerateFromGapsDto, @CurrentUser() user: RequestUser) {
    return this.remediationInitiativesService.generateFromGaps(user.tenantId, dto.organisationId, dto.assessmentId, dto.limit);
  }

  @Get()
  async findAll(
    @CurrentUser() user: RequestUser,
    @Query('organisationId') organisationId?: string,
    @Query('status') status?: string,
    @Query('sort') sort?: 'priority' | 'recent',
  ) {
    return this.remediationInitiativesService.findAll(user.tenantId, requireOrganisationId(organisationId), { status, sort });
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.remediationInitiativesService.findOne(id, user.tenantId);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(...REMEDIATION_WRITE_ROLES)
  @AuditLog('UPDATE', 'RemediationInitiative')
  async update(@Param('id') id: string, @Body() dto: UpdateRemediationInitiativeDto, @CurrentUser() user: RequestUser) {
    return this.remediationInitiativesService.update(id, user.tenantId, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.ORGANISATION_ADMIN)
  @AuditLog('DELETE', 'RemediationInitiative')
  async remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.remediationInitiativesService.remove(id, user.tenantId);
  }

  @Post(':id/risks/:riskId')
  @UseGuards(RolesGuard)
  @Roles(...REMEDIATION_WRITE_ROLES)
  @AuditLog('UPDATE', 'RemediationInitiative')
  async linkRisk(@Param('id') id: string, @Param('riskId') riskId: string, @CurrentUser() user: RequestUser) {
    return this.remediationInitiativesService.linkRisk(id, user.tenantId, riskId);
  }

  @Delete(':id/risks/:riskId')
  @UseGuards(RolesGuard)
  @Roles(...REMEDIATION_WRITE_ROLES)
  @AuditLog('UPDATE', 'RemediationInitiative')
  async unlinkRisk(@Param('id') id: string, @Param('riskId') riskId: string, @CurrentUser() user: RequestUser) {
    return this.remediationInitiativesService.unlinkRisk(id, user.tenantId, riskId);
  }
}
