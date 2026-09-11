import { encryptSecret } from '@cmmp/security';
import { BadRequestException, HttpException, NotFoundException } from '@nestjs/common';

import type { PrismaService } from '../prisma/prisma.service';

import { LlmSettingsService } from './llm-settings.service';

type MockModel = Record<string, jest.Mock>;

const TENANT_ID = 'tenant-1';

describe('LlmSettingsService', () => {
  let service: LlmSettingsService;
  let prisma: { llmProviderSetting: MockModel; llmUsageLimit: MockModel; llmUsageEvent: MockModel };

  beforeEach(() => {
    process.env.SETTINGS_ENCRYPTION_KEY = 'a'.repeat(64); // 32 bytes hex, test-only
    prisma = {
      llmProviderSetting: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        upsert: jest.fn(),
        deleteMany: jest.fn(),
      },
      llmUsageLimit: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
      },
      llmUsageEvent: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({}),
      },
    };
    service = new LlmSettingsService(prisma as unknown as PrismaService);
  });

  afterEach(() => {
    delete process.env.SETTINGS_ENCRYPTION_KEY;
    for (let slot = 1; slot <= 5; slot++) {
      delete process.env[`LLM_PROVIDER_${slot}_API_KEY`];
    }
  });

  describe('list', () => {
    it('reports slots 1-3 with their built-in defaults when nothing is configured', async () => {
      const views = await service.list(TENANT_ID);
      expect(views).toHaveLength(5);
      expect(views[0]).toMatchObject({ slot: 1, format: 'openai', model: 'openrouter/free', configured: false });
      expect(views[2]).toMatchObject({ slot: 3, format: 'anthropic', model: 'claude-opus-5', configured: false });
      expect(views[3]).toMatchObject({ slot: 4, configured: false, platformDefaultAvailable: false });
    });

    it('flags platformDefaultAvailable when the env var is set but the tenant has no saved row', async () => {
      process.env.LLM_PROVIDER_1_API_KEY = 'env-key';
      const views = await service.list(TENANT_ID);
      expect(views[0].platformDefaultAvailable).toBe(true);
    });

    it('reports a tenant-saved slot as configured, with only a masked preview of the key', async () => {
      prisma.llmProviderSetting.findMany.mockResolvedValue([
        {
          slot: 2,
          format: 'openai',
          baseUrl: 'https://api.example.test/v1',
          model: 'gpt-test',
          apiKeyPreview: 'ab12',
          updatedAt: new Date('2026-01-01T00:00:00Z'),
        },
      ]);
      const views = await service.list(TENANT_ID);
      expect(views[1]).toMatchObject({ slot: 2, configured: true, apiKeyPreview: '••••ab12', platformDefaultAvailable: false });
    });
  });

  describe('upsert', () => {
    it('rejects an out-of-range slot', async () => {
      await expect(service.upsert(TENANT_ID, 'user-1', 6, { format: 'anthropic', model: 'claude-opus-5', apiKey: 'sk-ant-1234567890' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('requires a baseUrl for the openai format', async () => {
      await expect(service.upsert(TENANT_ID, 'user-1', 1, { format: 'openai', model: 'gpt-test', apiKey: '1234567890' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('encrypts the key before saving and returns only a masked preview', async () => {
      prisma.llmProviderSetting.upsert.mockImplementation(({ create }) =>
        Promise.resolve({ ...create, updatedAt: new Date('2026-01-01T00:00:00Z') }),
      );

      const result = await service.upsert(TENANT_ID, 'user-1', 3, { format: 'anthropic', model: 'claude-opus-5', apiKey: 'sk-ant-1234567890' });

      const [[call]] = prisma.llmProviderSetting.upsert.mock.calls;
      expect(call.create.apiKeyEncrypted).not.toContain('sk-ant-1234567890');
      expect(call.create.apiKeyPreview).toBe('7890');
      expect(result.apiKeyPreview).toBe('••••7890');
      expect(result.configured).toBe(true);
    });
  });

  describe('remove', () => {
    it('deletes the tenant-scoped row for that slot', async () => {
      await service.remove(TENANT_ID, 2);
      expect(prisma.llmProviderSetting.deleteMany).toHaveBeenCalledWith({ where: { tenantId: TENANT_ID, slot: 2 } });
    });
  });

  describe('resolveProviderChainForAnalysis', () => {
    it('returns null when the tenant has configured nothing (caller falls back to env)', async () => {
      await expect(service.resolveProviderChainForAnalysis(TENANT_ID)).resolves.toBeNull();
    });

    it('returns the decrypted, ordered chain when the tenant has configured rows', async () => {
      // Save via upsert (captures a real ciphertext for the row below), then simulate the
      // subsequent read returning that same encrypted row.
      prisma.llmProviderSetting.upsert.mockImplementation(({ create }) => Promise.resolve({ ...create, updatedAt: new Date() }));
      await service.upsert(TENANT_ID, 'user-1', 1, { format: 'anthropic', model: 'claude-opus-5', apiKey: 'sk-ant-secret' });
      const savedRow = prisma.llmProviderSetting.upsert.mock.calls[0][0].create;
      prisma.llmProviderSetting.findMany.mockResolvedValue([savedRow]);

      const chain = await service.resolveProviderChainForAnalysis(TENANT_ID);
      expect(chain).toEqual([{ format: 'anthropic', baseUrl: null, model: 'claude-opus-5', apiKey: 'sk-ant-secret' }]);
    });

    it('returns just the requested slot when one is given, ignoring other configured slots', async () => {
      prisma.llmProviderSetting.findUnique.mockResolvedValue({
        slot: 2,
        format: 'openai',
        baseUrl: 'https://api.groq.com/openai/v1',
        model: 'llama-3.3-70b-versatile',
        apiKeyEncrypted: encryptSecret('gsk-secret'),
      });

      const chain = await service.resolveProviderChainForAnalysis(TENANT_ID, 2);

      expect(chain).toEqual([
        { format: 'openai', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', apiKey: 'gsk-secret' },
      ]);
      expect(prisma.llmProviderSetting.findMany).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the requested slot has no saved credential', async () => {
      prisma.llmProviderSetting.findUnique.mockResolvedValue(null);
      await expect(service.resolveProviderChainForAnalysis(TENANT_ID, 4)).rejects.toThrow(NotFoundException);
    });

    it('rejects an out-of-range slot', async () => {
      await expect(service.resolveProviderChainForAnalysis(TENANT_ID, 6)).rejects.toThrow(BadRequestException);
    });
  });

  describe('testConnection', () => {
    it('throws NotFoundException when no row is saved and no override credential is supplied', async () => {
      prisma.llmProviderSetting.findUnique.mockResolvedValue(null);
      await expect(service.testConnection(TENANT_ID, 1, {})).rejects.toThrow(NotFoundException);
    });
  });

  describe('getUsageSummary', () => {
    it('reports unlimited (null) and today\'s count when no limit row exists', async () => {
      prisma.llmUsageEvent.count.mockResolvedValue(7);
      const summary = await service.getUsageSummary(TENANT_ID);
      expect(summary).toEqual({ dailyCallLimit: null, todayCallCount: 7 });
    });

    it('reports the saved limit alongside today\'s count', async () => {
      prisma.llmUsageLimit.findUnique.mockResolvedValue({ dailyCallLimit: 50 });
      prisma.llmUsageEvent.count.mockResolvedValue(12);
      const summary = await service.getUsageSummary(TENANT_ID);
      expect(summary).toEqual({ dailyCallLimit: 50, todayCallCount: 12 });
    });

    it('scopes the count to events created since midnight UTC today', async () => {
      await service.getUsageSummary(TENANT_ID);
      const whereArg = prisma.llmUsageEvent.count.mock.calls[0][0].where;
      expect(whereArg.tenantId).toBe(TENANT_ID);
      expect(whereArg.createdAt.gte.getUTCHours()).toBe(0);
      expect(whereArg.createdAt.gte.getUTCMinutes()).toBe(0);
    });
  });

  describe('setUsageLimit', () => {
    it('saves a positive integer limit', async () => {
      prisma.llmUsageLimit.upsert.mockResolvedValue({ dailyCallLimit: 25 });
      await service.setUsageLimit(TENANT_ID, 25);
      expect(prisma.llmUsageLimit.upsert).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID },
        create: { tenantId: TENANT_ID, dailyCallLimit: 25 },
        update: { dailyCallLimit: 25 },
      });
    });

    it('saves null to mean unlimited', async () => {
      await service.setUsageLimit(TENANT_ID, null);
      expect(prisma.llmUsageLimit.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ create: { tenantId: TENANT_ID, dailyCallLimit: null } }),
      );
    });

    it('rejects zero or a negative limit', async () => {
      await expect(service.setUsageLimit(TENANT_ID, 0)).rejects.toThrow(BadRequestException);
      await expect(service.setUsageLimit(TENANT_ID, -1)).rejects.toThrow(BadRequestException);
    });
  });

  describe('assertUnderUsageLimit', () => {
    it('passes silently when no limit row exists', async () => {
      await expect(service.assertUnderUsageLimit(TENANT_ID)).resolves.toBeUndefined();
    });

    it('passes silently when under the limit', async () => {
      prisma.llmUsageLimit.findUnique.mockResolvedValue({ dailyCallLimit: 10 });
      prisma.llmUsageEvent.count.mockResolvedValue(9);
      await expect(service.assertUnderUsageLimit(TENANT_ID)).resolves.toBeUndefined();
    });

    it('throws a 429 once the limit is reached', async () => {
      prisma.llmUsageLimit.findUnique.mockResolvedValue({ dailyCallLimit: 10 });
      prisma.llmUsageEvent.count.mockResolvedValue(10);
      await expect(service.assertUnderUsageLimit(TENANT_ID)).rejects.toThrow(HttpException);
      await expect(service.assertUnderUsageLimit(TENANT_ID)).rejects.toMatchObject({ status: 429 });
    });
  });

  describe('recordUsage', () => {
    it('writes a usage event row', async () => {
      await service.recordUsage(TENANT_ID, 'data-analysis', true);
      expect(prisma.llmUsageEvent.create).toHaveBeenCalledWith({
        data: { tenantId: TENANT_ID, feature: 'data-analysis', success: true },
      });
    });

    it('swallows a write failure rather than throwing', async () => {
      prisma.llmUsageEvent.create.mockRejectedValueOnce(new Error('db down'));
      await expect(service.recordUsage(TENANT_ID, 'import-mapping', false)).resolves.toBeUndefined();
    });
  });
});
