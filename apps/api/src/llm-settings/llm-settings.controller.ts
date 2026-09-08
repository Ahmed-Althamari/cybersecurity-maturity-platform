import { UserRole } from '@cmmp/shared';
import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { AuditLog } from '../audit/decorators/audit-log.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { RequestUser } from '../auth/types/authenticated-request';

import { TestLlmProviderSettingDto, UpsertLlmProviderSettingDto } from './dto/upsert-llm-provider-setting.dto';
import { LlmSettingsService } from './llm-settings.service';

/**
 * Lets a tenant configure its own AI-assisted-features LLM provider credentials from the UI
 * (see apps/web/pages/settings/ai.tsx), instead of only ever being configurable via the
 * platform-wide LLM_PROVIDER_<n>_* env vars. Any authenticated user can view what's configured
 * (masked); only tenant admins can write or test credentials, since they're billing-sensitive.
 */
@ApiTags('LLM Settings')
@ApiBearerAuth()
@Controller('llm-settings')
@UseGuards(JwtAuthGuard)
export class LlmSettingsController {
  constructor(private readonly llmSettingsService: LlmSettingsService) {}

  @Get()
  async list(@CurrentUser() user: RequestUser) {
    return this.llmSettingsService.list(user.tenantId);
  }

  @Put(':slot')
  @UseGuards(RolesGuard)
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.ORGANISATION_ADMIN)
  @AuditLog('UPDATE', 'LlmProviderSetting')
  async upsert(
    @Param('slot', ParseIntPipe) slot: number,
    @Body() dto: UpsertLlmProviderSettingDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.llmSettingsService.upsert(user.tenantId, user.sub, slot, dto);
  }

  @Delete(':slot')
  @UseGuards(RolesGuard)
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.ORGANISATION_ADMIN)
  @AuditLog('DELETE', 'LlmProviderSetting')
  async remove(@Param('slot', ParseIntPipe) slot: number, @CurrentUser() user: RequestUser) {
    await this.llmSettingsService.remove(user.tenantId, slot);
    return { message: 'Removed' };
  }

  @Post(':slot/test')
  @UseGuards(RolesGuard)
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.ORGANISATION_ADMIN)
  async test(
    @Param('slot', ParseIntPipe) slot: number,
    @Body() dto: TestLlmProviderSettingDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.llmSettingsService.testConnection(user.tenantId, slot, dto);
  }
}
