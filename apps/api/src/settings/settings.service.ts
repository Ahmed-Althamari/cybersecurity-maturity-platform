import { decrypt, encrypt, EncryptionKeyError } from '@cmmp/security';
import type { IntegrationSettingsStatus } from '@cmmp/shared';
import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../prisma/prisma.service';

const ANTHROPIC_KEY_SETTING = 'ANTHROPIC_API_KEY';
const MIN_KEY_LENGTH = 8; // just enough to reject "", whitespace, or an obvious typo -- not a real format check

/**
 * The one place that knows how an integration secret like the Anthropic API
 * key is actually resolved: a value set here in the database (encrypted),
 * falling back to the plain `ANTHROPIC_API_KEY` environment variable so a
 * pure env-var deployment (no admin ever visited the settings page) keeps
 * working exactly as before. Every read/write of the *plaintext* stays
 * inside this service -- callers like AiMappingService only ever see
 * `getAnthropicApiKey()`'s resolved string (or null), never the ciphertext
 * or the encryption key.
 */
@Injectable()
export class SettingsService {
  private readonly logger = new Logger('SettingsService');

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  private encryptionKey(): string {
    const key = this.config.get<string>('SETTINGS_ENCRYPTION_KEY');
    if (!key) {
      throw new InternalServerErrorException(
        'SETTINGS_ENCRYPTION_KEY is not configured -- an operator must set it before any integration secret can be saved through the settings UI (see docs/deployment-guide.md).',
      );
    }
    return key;
  }

  /** Status only, never the secret itself -- safe to return from an HTTP endpoint. */
  async getAnthropicApiKeyStatus(): Promise<IntegrationSettingsStatus> {
    const stored = await this.prisma.platformSetting.findUnique({ where: { key: ANTHROPIC_KEY_SETTING } });
    if (stored) {
      return { anthropicApiKeyConfigured: true, anthropicApiKeySource: 'database' };
    }
    if (this.config.get<string>('ANTHROPIC_API_KEY')) {
      return { anthropicApiKeyConfigured: true, anthropicApiKeySource: 'environment' };
    }
    return { anthropicApiKeyConfigured: false, anthropicApiKeySource: 'none' };
  }

  /**
   * The resolved plaintext key for actually calling the API -- internal use
   * only (AiMappingService), never exposed through a controller. Database
   * value wins over the environment variable when both are set, so an
   * admin's in-app change takes effect immediately without needing the env
   * var removed too. A decrypt failure (e.g. SETTINGS_ENCRYPTION_KEY was
   * rotated without re-saving the stored value) is logged and treated as
   * "not configured" rather than thrown -- consistent with this feature
   * being a pure enhancement everywhere else, never a hard dependency.
   */
  async getAnthropicApiKey(): Promise<string | null> {
    const stored = await this.prisma.platformSetting.findUnique({ where: { key: ANTHROPIC_KEY_SETTING } });
    if (stored) {
      try {
        return decrypt(stored.value, this.encryptionKey());
      } catch (error) {
        this.logger.warn(
          `Stored ANTHROPIC_API_KEY could not be decrypted (${
            error instanceof Error ? error.message : String(error)
          }) -- falling back to the ANTHROPIC_API_KEY environment variable, if any.`,
        );
      }
    }
    return this.config.get<string>('ANTHROPIC_API_KEY') ?? null;
  }

  /** Encrypts and stores a new key. Throws if SETTINGS_ENCRYPTION_KEY itself isn't configured -- a real misconfiguration the caller (a PLATFORM_ADMIN saving the form) needs to see, not a silent no-op. */
  async setAnthropicApiKey(rawKey: string): Promise<void> {
    const trimmed = rawKey.trim();
    if (trimmed.length < MIN_KEY_LENGTH) {
      throw new BadRequestException(`API key looks too short to be real (must be at least ${MIN_KEY_LENGTH} characters)`);
    }

    let ciphertext: string;
    try {
      ciphertext = encrypt(trimmed, this.encryptionKey());
    } catch (error) {
      if (error instanceof EncryptionKeyError) {
        throw new InternalServerErrorException(
          'SETTINGS_ENCRYPTION_KEY is misconfigured (must be a 32-byte value, base64 or hex encoded) -- cannot safely store this key.',
        );
      }
      throw error;
    }

    await this.prisma.platformSetting.upsert({
      where: { key: ANTHROPIC_KEY_SETTING },
      create: { key: ANTHROPIC_KEY_SETTING, value: ciphertext },
      update: { value: ciphertext },
    });
  }

  /** Removes the database-stored key (idempotent). Falls back to the environment variable, if any, exactly like never having set one. */
  async clearAnthropicApiKey(): Promise<void> {
    await this.prisma.platformSetting.deleteMany({ where: { key: ANTHROPIC_KEY_SETTING } });
  }
}
