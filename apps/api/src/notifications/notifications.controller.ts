import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { RequestUser } from '../auth/types/authenticated-request';

import { NotificationsService } from './notifications.service';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('due-dates')
  async getDueDateAlerts(@CurrentUser() user: RequestUser, @Query('organisationId') organisationId?: string) {
    if (!organisationId) {
      throw new BadRequestException('organisationId query parameter is required');
    }
    return this.notificationsService.getDueDateAlerts(user.tenantId, organisationId);
  }
}
