import { decrypt, generateEncryptionKey } from '@cmmp/security';
import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../prisma/prisma.service';

import { SettingsService } from './settings.service';

const REAL_ENCRYPTION_KEY = generateEncryptionKey();

describe('SettingsService', () => {
  let service: SettingsService;
  let prisma: { platformSetting: { findUnique: jest.Mock; upsert: jest.Mock; deleteMany: jest.Mock } };
  let config: { get: jest.Mock };

  beforeEach(() => {
    prisma = {
      platformSetting: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
        deleteMany: jest.fn(),
      },
    };
    config = { get: jest.fn() };
    service = new SettingsService(prisma as unknown as PrismaService, config as unknown as ConfigService);
  });

  function configuring(vars: Record<string, string | undefined>) {
    config.get.mockImplementation((key: string) => vars[key]);
  }

  describe('getAnthropicApiKeyStatus', () => {
    it('reports "database" when a row is stored, regardless of the environment variable', async () => {
      prisma.platformSetting.findUnique.mockResolvedValueOnce({ key: 'ANTHROPIC_API_KEY', value: 'ciphertext' });
      configuring({ ANTHROPIC_API_KEY: 'sk-ant-env-value' });

      const status = await service.getAnthropicApiKeyStatus();
      expect(status).toEqual({ anthropicApiKeyConfigured: true, anthropicApiKeySource: 'database' });
    });

    it('reports "environment" when no row is stored but the env var is set', async () => {
      configuring({ ANTHROPIC_API_KEY: 'sk-ant-env-value' });
      const status = await service.getAnthropicApiKeyStatus();
      expect(status).toEqual({ anthropicApiKeyConfigured: true, anthropicApiKeySource: 'environment' });
    });

    it('reports "none" when neither is set', async () => {
      configuring({});
      const status = await service.getAnthropicApiKeyStatus();
      expect(status).toEqual({ anthropicApiKeyConfigured: false, anthropicApiKeySource: 'none' });
    });

    it('never includes the key value itself, only booleans/enums', async () => {
      prisma.platformSetting.findUnique.mockResolvedValueOnce({ key: 'ANTHROPIC_API_KEY', value: 'super-secret-ciphertext' });
      const status = await service.getAnthropicApiKeyStatus();
      expect(JSON.stringify(status)).not.toContain('super-secret-ciphertext');
    });
  });

  describe('setAnthropicApiKey / getAnthropicApiKey round trip', () => {
    it('encrypts on write and decrypts back to the original plaintext on read', async () => {
      configuring({ SETTINGS_ENCRYPTION_KEY: REAL_ENCRYPTION_KEY });
      let stored: { key: string; value: string } | undefined;
      prisma.platformSetting.upsert.mockImplementation(({ create }: { create: { key: string; value: string } }) => {
        stored = create;
        return Promise.resolve(stored);
      });

      await service.setAnthropicApiKey('sk-ant-real-looking-key-12345');

      expect(prisma.platformSetting.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { key: 'ANTHROPIC_API_KEY' } }),
      );
      expect(stored!.value).not.toContain('sk-ant-real-looking-key-12345'); // never stored as plaintext
      expect(decrypt(stored!.value, REAL_ENCRYPTION_KEY)).toBe('sk-ant-real-looking-key-12345');

      prisma.platformSetting.findUnique.mockResolvedValueOnce(stored);
      const resolved = await service.getAnthropicApiKey();
      expect(resolved).toBe('sk-ant-real-looking-key-12345');
    });

    it('trims surrounding whitespace before storing', async () => {
      configuring({ SETTINGS_ENCRYPTION_KEY: REAL_ENCRYPTION_KEY });
      await service.setAnthropicApiKey('  sk-ant-with-whitespace  \n');
      const [[{ create }]] = prisma.platformSetting.upsert.mock.calls;
      expect(decrypt(create.value, REAL_ENCRYPTION_KEY)).toBe('sk-ant-with-whitespace');
    });

    it('rejects an obviously-too-short value without touching the database', async () => {
      configuring({ SETTINGS_ENCRYPTION_KEY: REAL_ENCRYPTION_KEY });
      await expect(service.setAnthropicApiKey('short')).rejects.toThrow(BadRequestException);
      expect(prisma.platformSetting.upsert).not.toHaveBeenCalled();
    });

    it('throws a clear error when SETTINGS_ENCRYPTION_KEY is not configured at all', async () => {
      configuring({});
      await expect(service.setAnthropicApiKey('sk-ant-real-looking-key-12345')).rejects.toThrow(
        InternalServerErrorException,
      );
      expect(prisma.platformSetting.upsert).not.toHaveBeenCalled();
    });

    it('throws a clear error when SETTINGS_ENCRYPTION_KEY is the wrong length', async () => {
      configuring({ SETTINGS_ENCRYPTION_KEY: 'not-a-real-32-byte-key' });
      await expect(service.setAnthropicApiKey('sk-ant-real-looking-key-12345')).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('getAnthropicApiKey fallback behavior', () => {
    it('falls back to the environment variable when nothing is stored', async () => {
      configuring({ ANTHROPIC_API_KEY: 'sk-ant-env-fallback' });
      expect(await service.getAnthropicApiKey()).toBe('sk-ant-env-fallback');
    });

    it('returns null when neither the database nor the environment has a key', async () => {
      configuring({});
      expect(await service.getAnthropicApiKey()).toBeNull();
    });

    it('falls back to the environment variable (never throws) when the stored value cannot be decrypted', async () => {
      // e.g. SETTINGS_ENCRYPTION_KEY was rotated without re-saving the stored value.
      configuring({ SETTINGS_ENCRYPTION_KEY: generateEncryptionKey(), ANTHROPIC_API_KEY: 'sk-ant-env-fallback' });
      prisma.platformSetting.findUnique.mockResolvedValueOnce({
        key: 'ANTHROPIC_API_KEY',
        value: 'garbage.not.decryptable',
      });

      expect(await service.getAnthropicApiKey()).toBe('sk-ant-env-fallback');
    });
  });

  describe('clearAnthropicApiKey', () => {
    it('deletes the stored row', async () => {
      await service.clearAnthropicApiKey();
      expect(prisma.platformSetting.deleteMany).toHaveBeenCalledWith({ where: { key: 'ANTHROPIC_API_KEY' } });
    });
  });
});
