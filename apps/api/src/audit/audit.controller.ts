import { UserRole } from '@cmmp/shared';
import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { RequestUser } from '../auth/types/authenticated-request';

import { AuditService } from './audit.service';
import { QueryAuditEventsDto } from './dto/query-audit-events.dto';

const AUDIT_READ_ROLES = [UserRole.PLATFORM_ADMIN, UserRole.ORGANISATION_ADMIN, UserRole.CISO, UserRole.AUDITOR, UserRole.GRC_MANAGER];

@ApiTags('Audit')
@ApiBearerAuth()
@Controller('audit-events')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AuditController {
  constructor(private auditService: AuditService) {}

  @Get()
  @Roles(...AUDIT_READ_ROLES)
  async findAll(@CurrentUser() user: RequestUser, @Query() query: QueryAuditEventsDto) {
    return this.auditService.findAll(user.tenantId, query);
  }

  @Get(':id')
  @Roles(...AUDIT_READ_ROLES)
  async findOne(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.auditService.findOne(id, user.tenantId);
  }
}
