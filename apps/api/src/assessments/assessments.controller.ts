import { UserRole } from '@cmmp/shared';
import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards, Delete } from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { RequestUser } from '../auth/types/authenticated-request';

import { AssessmentsService } from './assessments.service';
import { CreateAssessmentDto } from './dto/create-assessment.dto';
import { UpdateAssessmentDto } from './dto/update-assessment.dto';
import { UpsertAssessmentItemDto } from './dto/upsert-assessment-item.dto';

const ASSESSMENT_WRITE_ROLES = [
  UserRole.PLATFORM_ADMIN,
  UserRole.ORGANISATION_ADMIN,
  UserRole.CISO,
  UserRole.GRC_MANAGER,
  UserRole.ASSESSOR,
];

@Controller('assessments')
@UseGuards(JwtAuthGuard)
export class AssessmentsController {
  constructor(private assessmentsService: AssessmentsService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(...ASSESSMENT_WRITE_ROLES)
  async create(@Body() dto: CreateAssessmentDto, @CurrentUser() user: RequestUser) {
    return this.assessmentsService.create(user.tenantId, user.sub, dto);
  }

  @Get()
  async findAll(
    @CurrentUser() user: RequestUser,
    @Query('organisationId') organisationId?: string,
    @Query('status') status?: string,
  ) {
    return this.assessmentsService.findAll(user.tenantId, organisationId, status);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.assessmentsService.findOne(id, user.tenantId);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(...ASSESSMENT_WRITE_ROLES)
  async update(@Param('id') id: string, @Body() dto: UpdateAssessmentDto, @CurrentUser() user: RequestUser) {
    return this.assessmentsService.update(id, user.tenantId, user.sub, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.ORGANISATION_ADMIN)
  async remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.assessmentsService.remove(id, user.tenantId);
  }

  @Get(':id/history')
  async history(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.assessmentsService.history(id, user.tenantId);
  }

  @Get(':id/results')
  async getResults(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.assessmentsService.getResults(id, user.tenantId);
  }

  @Get(':id/gaps')
  async getGaps(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Query('depth') depth?: string,
    @Query('limit') limit?: string,
    @Query('minGap') minGap?: string,
  ) {
    return this.assessmentsService.getGaps(id, user.tenantId, {
      depth: depth !== undefined ? Number(depth) : undefined,
      limit: limit !== undefined ? Number(limit) : undefined,
      minGap: minGap !== undefined ? Number(minGap) : undefined,
    });
  }

  @Post(':id/items')
  @UseGuards(RolesGuard)
  @Roles(...ASSESSMENT_WRITE_ROLES)
  async upsertItem(@Param('id') id: string, @Body() dto: UpsertAssessmentItemDto, @CurrentUser() user: RequestUser) {
    return this.assessmentsService.upsertItem(id, user.tenantId, user.sub, dto);
  }

  @Post(':id/submit')
  @UseGuards(RolesGuard)
  @Roles(...ASSESSMENT_WRITE_ROLES)
  async submit(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.assessmentsService.submit(id, user.tenantId, user.sub);
  }
}
