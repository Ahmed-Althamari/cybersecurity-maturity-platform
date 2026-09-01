import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@cmmp/shared';
import { AssessmentsService } from './assessments.service';
import { CreateAssessmentDto } from './dto/create-assessment.dto';
import { UpdateAssessmentDto } from './dto/update-assessment.dto';
import { UpdateAssessmentItemDto } from './dto/update-assessment-item.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

const AUTHORS = [
  UserRole.PLATFORM_ADMIN,
  UserRole.ORGANISATION_ADMIN,
  UserRole.CISO,
  UserRole.GRC_MANAGER,
  UserRole.ASSESSOR,
];
const APPROVERS = [UserRole.PLATFORM_ADMIN, UserRole.ORGANISATION_ADMIN, UserRole.CISO];
const ARCHIVERS = [UserRole.PLATFORM_ADMIN, UserRole.ORGANISATION_ADMIN];

@Controller('assessments')
@UseGuards(JwtAuthGuard)
export class AssessmentsController {
  constructor(private assessmentsService: AssessmentsService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(...AUTHORS)
  async create(@Body() dto: CreateAssessmentDto, @CurrentUser() user: any) {
    return this.assessmentsService.create(user.tenantId, user.sub, dto);
  }

  @Get()
  async findAll(@Query('organisationId') organisationId: string | undefined, @CurrentUser() user: any) {
    return this.assessmentsService.findAll(user.tenantId, organisationId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.assessmentsService.findOne(user.tenantId, id);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(...AUTHORS)
  async update(@Param('id') id: string, @Body() dto: UpdateAssessmentDto, @CurrentUser() user: any) {
    return this.assessmentsService.update(user.tenantId, user.sub, id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(...ARCHIVERS)
  async remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.assessmentsService.remove(user.tenantId, id);
  }

  @Patch(':id/items/:itemId')
  @UseGuards(RolesGuard)
  @Roles(...AUTHORS)
  async updateItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateAssessmentItemDto,
    @CurrentUser() user: any,
  ) {
    return this.assessmentsService.updateItem(user.tenantId, user.sub, id, itemId, dto);
  }

  @Post(':id/submit')
  @UseGuards(RolesGuard)
  @Roles(...AUTHORS)
  async submit(@Param('id') id: string, @CurrentUser() user: any) {
    return this.assessmentsService.submit(user.tenantId, user.sub, id);
  }

  @Post(':id/approve')
  @UseGuards(RolesGuard)
  @Roles(...APPROVERS)
  async approve(@Param('id') id: string, @CurrentUser() user: any) {
    return this.assessmentsService.approve(user.tenantId, user.sub, id);
  }

  @Post(':id/reopen')
  @UseGuards(RolesGuard)
  @Roles(...AUTHORS)
  async reopen(@Param('id') id: string, @CurrentUser() user: any) {
    return this.assessmentsService.reopen(user.tenantId, user.sub, id);
  }

  @Post(':id/archive')
  @UseGuards(RolesGuard)
  @Roles(...ARCHIVERS)
  async archive(@Param('id') id: string, @CurrentUser() user: any) {
    return this.assessmentsService.archive(user.tenantId, user.sub, id);
  }

  @Get(':id/history')
  async getHistory(@Param('id') id: string, @CurrentUser() user: any) {
    return this.assessmentsService.getHistory(user.tenantId, id);
  }

  @Get(':id/scores')
  async getScores(
    @Param('id') id: string,
    @Query('levels') levels: string | undefined,
    @Query('minGap') minGap: string | undefined,
    @CurrentUser() user: any,
  ) {
    return this.assessmentsService.getScores(user.tenantId, id, {
      levels: levels?.split(',') as ('function' | 'category' | 'subcategory')[] | undefined,
      minGap: minGap !== undefined ? Number(minGap) : undefined,
    });
  }
}
