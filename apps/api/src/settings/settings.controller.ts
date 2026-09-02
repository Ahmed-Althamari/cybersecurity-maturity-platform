import { UserRole } from '@cmmp/shared';
import { BadRequestException, Body, Controller, Delete, Get, Put, UseGuards } from '@nestjs/common';

import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

import { SettingsService } from './settings.service';

/**
 * Platform-wide integration settings -- today just the Anthropic API key
 * that powers AiMappingService's optional column-mapping suggestion.
 * PLATFORM_ADMIN only: this configures a shared credential for the whole
 * installation, not a per-tenant preference. `@Roles()` is applied to each
 * handler individually (never at the class level) -- see
 * docs/security-architecture.md for the real RBAC bypass this exact
 * class-vs-method distinction caused once already on AuditController.
 */
@Controller('settings')
@UseGuards(JwtAuthGuard)
export class SettingsController {
  constructor(private settingsService: SettingsService) {}

  @Get('integrations')
  @UseGuards(RolesGuard)
  @Roles(UserRole.PLATFORM_ADMIN)
  async getIntegrationSettings() {
    return this.settingsService.getAnthropicApiKeyStatus();
  }

  @Put('integrations/anthropic-api-key')
  @UseGuards(RolesGuard)
  @Roles(UserRole.PLATFORM_ADMIN)
  async setAnthropicApiKey(@Body('apiKey') apiKey: string | undefined) {
    if (!apiKey || typeof apiKey !== 'string') {
      throw new BadRequestException("'apiKey' (a non-empty string) is required");
    }
    await this.settingsService.setAnthropicApiKey(apiKey);
    // Never echo the key back -- only ever the status, exactly like GET.
    return this.settingsService.getAnthropicApiKeyStatus();
  }

  @Delete('integrations/anthropic-api-key')
  @UseGuards(RolesGuard)
  @Roles(UserRole.PLATFORM_ADMIN)
  async clearAnthropicApiKey() {
    await this.settingsService.clearAnthropicApiKey();
    return this.settingsService.getAnthropicApiKeyStatus();
  }
}
