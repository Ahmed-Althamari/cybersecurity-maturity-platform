import { UserRole } from '@cmmp/shared';
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';

import { CreateInitiativeDto } from './dto/create-initiative.dto';
import { UpdateInitiativeDto } from './dto/update-initiative.dto';
import { InitiativesService } from './initiatives.service';


const AUTHORS = [
  UserRole.PLATFORM_ADMIN,
  UserRole.ORGANISATION_ADMIN,
  UserRole.CISO,
  UserRole.GRC_MANAGER,
  UserRole.REMEDIATION_OWNER,
];
const DELETERS = [UserRole.PLATFORM_ADMIN, UserRole.ORGANISATION_ADMIN];

@Controller('initiatives')
@UseGuards(JwtAuthGuard)
export class InitiativesController {
  constructor(private initiativesService: InitiativesService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(...AUTHORS)
  async create(@Body() dto: CreateInitiativeDto, @CurrentUser() user: AuthenticatedUser) {
    return this.initiativesService.create(user.tenantId, dto);
  }

  @Get()
  async findAll(
    @Query('organisationId') organisationId: string | undefined,
    @Query('status') status: string | undefined,
    @Query('sortBy') sortBy: 'priority' | 'createdAt' | undefined,
    @Query('search') search: string | undefined,
    @Query('page') page: string | undefined,
    @Query('pageSize') pageSize: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.initiativesService.findAll(
      user.tenantId,
      { organisationId, status, sortBy, search },
      { page: Number(page), pageSize: Number(pageSize) },
    );
  }

  @Get('timeline')
  async getTimeline(
    @Query('organisationId') organisationId: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.initiativesService.getTimeline(user.tenantId, organisationId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.initiativesService.findOne(user.tenantId, id);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(...AUTHORS)
  async update(@Param('id') id: string, @Body() dto: UpdateInitiativeDto, @CurrentUser() user: AuthenticatedUser) {
    return this.initiativesService.update(user.tenantId, id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(...DELETERS)
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.initiativesService.remove(user.tenantId, id);
  }

  @Post(':id/risks/:riskId')
  @UseGuards(RolesGuard)
  @Roles(...AUTHORS)
  async linkRisk(
    @Param('id') id: string,
    @Param('riskId') riskId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.initiativesService.linkRisk(user.tenantId, id, riskId);
  }

  @Delete(':id/risks/:riskId')
  @UseGuards(RolesGuard)
  @Roles(...AUTHORS)
  async unlinkRisk(
    @Param('id') id: string,
    @Param('riskId') riskId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.initiativesService.unlinkRisk(user.tenantId, id, riskId);
  }
}
