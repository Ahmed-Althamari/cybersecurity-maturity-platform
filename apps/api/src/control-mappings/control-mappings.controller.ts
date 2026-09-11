import { UserRole } from '@cmmp/shared';
import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { AuditLog } from '../audit/decorators/audit-log.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { RequestUser } from '../auth/types/authenticated-request';

import { ControlMappingsService } from './control-mappings.service';
import { CreateControlMappingDto } from './dto/create-control-mapping.dto';

const CONTROL_MAPPING_WRITE_ROLES = [
  UserRole.PLATFORM_ADMIN,
  UserRole.ORGANISATION_ADMIN,
  UserRole.CISO,
  UserRole.GRC_MANAGER,
  UserRole.SECURITY_ARCHITECT,
];

/**
 * A tenant's own crosswalk between two of its loaded frameworks (e.g. NIST CSF to ISO 27001) —
 * see apps/web/pages/frameworks/mappings.tsx. Any authenticated user can view the crosswalk;
 * only GRC-adjacent roles can create or remove mapping entries.
 */
@ApiTags('Control Mappings')
@ApiBearerAuth()
@Controller('control-mappings')
@UseGuards(JwtAuthGuard)
export class ControlMappingsController {
  constructor(private readonly controlMappingsService: ControlMappingsService) {}

  @Get()
  async findBetweenFrameworks(
    @Query('sourceFrameworkId') sourceFrameworkId: string | undefined,
    @Query('targetFrameworkId') targetFrameworkId: string | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    if (!sourceFrameworkId || !targetFrameworkId) {
      throw new BadRequestException('sourceFrameworkId and targetFrameworkId query parameters are both required');
    }
    return this.controlMappingsService.findBetweenFrameworks(user.tenantId, sourceFrameworkId, targetFrameworkId);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(...CONTROL_MAPPING_WRITE_ROLES)
  @AuditLog('CREATE', 'ControlMapping')
  async create(@Body() dto: CreateControlMappingDto, @CurrentUser() user: RequestUser) {
    return this.controlMappingsService.create(user.tenantId, user.sub, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(...CONTROL_MAPPING_WRITE_ROLES)
  @AuditLog('DELETE', 'ControlMapping')
  async remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    await this.controlMappingsService.remove(user.tenantId, id);
    return { message: 'Removed' };
  }
}
