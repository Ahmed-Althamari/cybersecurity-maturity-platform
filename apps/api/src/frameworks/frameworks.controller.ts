import { UserRole } from '@cmmp/shared';
import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { RequestUser } from '../auth/types/authenticated-request';

import { FrameworksService } from './frameworks.service';

@Controller('frameworks')
@UseGuards(JwtAuthGuard)
export class FrameworksController {
  constructor(private frameworksService: FrameworksService) {}

  @Get()
  async findAll(@CurrentUser() user: RequestUser) {
    return this.frameworksService.findAll(user.tenantId);
  }

  @Post('import')
  @UseGuards(RolesGuard)
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.ORGANISATION_ADMIN)
  async importDefinition(@Body() rawDefinition: unknown, @CurrentUser() user: RequestUser) {
    return this.frameworksService.importDefinition(user.tenantId, rawDefinition);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.frameworksService.findOne(id, user.tenantId);
  }

  @Get(':id/navigation')
  async getNavigation(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.frameworksService.getNavigation(id, user.tenantId);
  }
}
