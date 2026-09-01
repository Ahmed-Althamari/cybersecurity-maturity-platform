import { AuditAction, UserRole } from '@cmmp/shared';
import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

import { AuditService } from './audit.service';


const AUDIT_READERS = [
  UserRole.PLATFORM_ADMIN,
  UserRole.ORGANISATION_ADMIN,
  UserRole.AUDITOR,
  UserRole.CISO,
];

@Controller('audit-events')
@UseGuards(JwtAuthGuard)
export class AuditController {
  constructor(private auditService: AuditService) {}

  @Get()
  @UseGuards(RolesGuard)
  @Roles(...AUDIT_READERS)
  async findAll(
    @Query('userId') userId: string | undefined,
    @Query('action') action: AuditAction | undefined,
    @Query('resource') resource: string | undefined,
    @Query('resourceId') resourceId: string | undefined,
    @Query('correlationId') correlationId: string | undefined,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Query('page') page: string | undefined,
    @Query('pageSize') pageSize: string | undefined,
    @CurrentUser() user: any,
  ) {
    return this.auditService.findAll(user.tenantId, {
      userId,
      action,
      resource,
      resourceId,
      correlationId,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get('summary')
  @UseGuards(RolesGuard)
  @Roles(...AUDIT_READERS)
  async getSummary(@Query('sinceDays') sinceDays: string | undefined, @CurrentUser() user: any) {
    return this.auditService.getSummary(user.tenantId, sinceDays ? Number(sinceDays) : undefined);
  }
}
