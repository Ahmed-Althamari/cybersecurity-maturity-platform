import { UserRole } from '@cmmp/shared';
import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { RequestUser } from '../auth/types/authenticated-request';

import { CreateRiskDto } from './dto/create-risk.dto';
import { UpdateRiskDto } from './dto/update-risk.dto';
import { RisksService } from './risks.service';

const RISK_WRITE_ROLES = [
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

@Controller('risks')
@UseGuards(JwtAuthGuard)
export class RisksController {
  constructor(private risksService: RisksService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(...RISK_WRITE_ROLES)
  async create(@Body() dto: CreateRiskDto, @CurrentUser() user: RequestUser) {
    return this.risksService.create(user.tenantId, dto);
  }

  @Get()
  async findAll(
    @CurrentUser() user: RequestUser,
    @Query('organisationId') organisationId?: string,
    @Query('status') status?: string,
    @Query('riskLevel') riskLevel?: string,
    @Query('sort') sort?: 'priority' | 'recent',
  ) {
    return this.risksService.findAll(user.tenantId, requireOrganisationId(organisationId), { status, riskLevel, sort });
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.risksService.findOne(id, user.tenantId);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(...RISK_WRITE_ROLES)
  async update(@Param('id') id: string, @Body() dto: UpdateRiskDto, @CurrentUser() user: RequestUser) {
    return this.risksService.update(id, user.tenantId, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.ORGANISATION_ADMIN)
  async remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.risksService.remove(id, user.tenantId);
  }
}
