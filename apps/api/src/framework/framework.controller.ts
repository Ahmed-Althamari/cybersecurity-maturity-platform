import { UserRole } from '@cmmp/shared';
import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';

import { FrameworkService } from './framework.service';


@Controller('frameworks')
@UseGuards(JwtAuthGuard)
export class FrameworkController {
  constructor(private frameworkService: FrameworkService) {}

  @Get()
  async findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.frameworkService.findAll(user.tenantId);
  }

  @Get(':slug')
  async getTree(
    @Param('slug') slug: string,
    @Query('version') version: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.frameworkService.getTree(user.tenantId, slug, version);
  }

  @Get(':slug/components')
  async getComponentDescriptor(
    @Param('slug') slug: string,
    @Query('version') version: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.frameworkService.getComponentDescriptor(user.tenantId, slug, version);
  }

  @Post('validate')
  validateDefinition(@Body() definition: unknown) {
    return this.frameworkService.validateDefinition(definition);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.ORGANISATION_ADMIN)
  async create(@Body() definition: unknown, @CurrentUser() user: AuthenticatedUser) {
    return this.frameworkService.create(user.tenantId, definition);
  }
}
