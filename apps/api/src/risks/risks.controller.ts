import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { RiskLevel, UserRole } from '@cmmp/shared';
import { RisksService } from './risks.service';
import { CreateRiskDto } from './dto/create-risk.dto';
import { UpdateRiskDto } from './dto/update-risk.dto';
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
  UserRole.CONTROL_OWNER,
];
const DELETERS = [UserRole.PLATFORM_ADMIN, UserRole.ORGANISATION_ADMIN];

@Controller('risks')
@UseGuards(JwtAuthGuard)
export class RisksController {
  constructor(private risksService: RisksService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(...AUTHORS)
  async create(@Body() dto: CreateRiskDto, @CurrentUser() user: any) {
    return this.risksService.create(user.tenantId, dto);
  }

  @Get()
  async findAll(
    @Query('organisationId') organisationId: string | undefined,
    @Query('riskLevel') riskLevel: RiskLevel | undefined,
    @Query('status') status: string | undefined,
    @Query('assessmentItemId') assessmentItemId: string | undefined,
    @Query('sortBy') sortBy: 'score' | 'createdAt' | undefined,
    @CurrentUser() user: any,
  ) {
    return this.risksService.findAll(user.tenantId, {
      organisationId,
      riskLevel,
      status,
      assessmentItemId,
      sortBy,
    });
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.risksService.findOne(user.tenantId, id);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(...AUTHORS)
  async update(@Param('id') id: string, @Body() dto: UpdateRiskDto, @CurrentUser() user: any) {
    return this.risksService.update(user.tenantId, id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(...DELETERS)
  async remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.risksService.remove(user.tenantId, id);
  }

  @Post(':id/initiatives/:initiativeId')
  @UseGuards(RolesGuard)
  @Roles(...AUTHORS)
  async linkInitiative(
    @Param('id') id: string,
    @Param('initiativeId') initiativeId: string,
    @CurrentUser() user: any,
  ) {
    return this.risksService.linkInitiative(user.tenantId, id, initiativeId);
  }

  @Delete(':id/initiatives/:initiativeId')
  @UseGuards(RolesGuard)
  @Roles(...AUTHORS)
  async unlinkInitiative(
    @Param('id') id: string,
    @Param('initiativeId') initiativeId: string,
    @CurrentUser() user: any,
  ) {
    return this.risksService.unlinkInitiative(user.tenantId, id, initiativeId);
  }
}
