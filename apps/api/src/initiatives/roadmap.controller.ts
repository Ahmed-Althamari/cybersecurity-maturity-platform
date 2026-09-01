import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@cmmp/shared';
import { InitiativesService } from './initiatives.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('assessments/:id/roadmap')
@UseGuards(JwtAuthGuard)
export class RoadmapController {
  constructor(private initiativesService: InitiativesService) {}

  @Post('generate')
  @UseGuards(RolesGuard)
  @Roles(
    UserRole.PLATFORM_ADMIN,
    UserRole.ORGANISATION_ADMIN,
    UserRole.CISO,
    UserRole.GRC_MANAGER,
    UserRole.REMEDIATION_OWNER,
  )
  async generate(
    @Param('id') assessmentId: string,
    @Body('minGap') minGap: number | undefined,
    @CurrentUser() user: any,
  ) {
    return this.initiativesService.generateFromGaps(user.tenantId, assessmentId, minGap);
  }
}
