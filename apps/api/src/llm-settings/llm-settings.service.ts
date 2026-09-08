import { decryptSecret, encryptSecret, previewSecret } from '@cmmp/security';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import {
  buildClient,
  FallbackLlmClient,
  MAX_PROVIDER_SLOTS,
  resolveLlmClient,
  SLOT_DEFAULTS,
  type LlmClient,
  type ProviderFormat,
} from '../assessments/import-mapping/llm-client';
import { PrismaService } from '../prisma/prisma.service';

import type { TestLlmProviderSettingDto, UpsertLlmProviderSettingDto } from './dto/upsert-llm-provider-setting.dto';

export interface LlmProviderSettingView {
  slot: number;
  format: ProviderFormat;
  baseUrl: string | null;
  model: string;
  /** true once this tenant has saved its own credential for this slot — takes over from the platform default entirely. */
  configured: boolean;
  /** true when this slot has no tenant credential but the platform-wide env var is set, so it's still usable. */
  platformDefaultAvailable: boolean;
  apiKeyPreview: string | null;
  updatedAt: string | null;
}

export interface AnalysisProviderConfig {
  format: ProviderFormat;
  baseUrl: string | null;
  model: string;
  apiKey: string;
}

const TEST_SYSTEM_PROMPT = 'You are a connectivity test. Reply with exactly one word.';
const TEST_USER_PROMPT = 'Reply with exactly: OK';

function assertValidSlot(slot: number): void {
  if (!Number.isInteger(slot) || slot < 1 || slot > MAX_PROVIDER_SLOTS) {
    throw new BadRequestException(`slot must be an integer between 1 and ${MAX_PROVIDER_SLOTS}`);
  }
}

/**
 * Tenant-owned counterpart to llm-client.ts's env-var-only `resolveLlmClient()`. A tenant that
 * saves its own credentials here takes over its whole provider chain — its usage is never mixed
 * with (or billed to) the platform-wide `LLM_PROVIDER_<n>_*` defaults. A tenant that saves
 * nothing keeps using those defaults exactly as before this feature existed.
 */
@Injectable()
export class LlmSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string): Promise<LlmProviderSettingView[]> {
    const rows = await this.prisma.llmProviderSetting.findMany({ where: { tenantId } });
    const bySlot = new Map(rows.map((row) => [row.slot, row]));

    const views: LlmProviderSettingView[] = [];
    for (let slot = 1; slot <= MAX_PROVIDER_SLOTS; slot++) {
      const row = bySlot.get(slot);
      const defaults = SLOT_DEFAULTS[slot];
      if (row) {
        views.push({
          slot,
          format: row.format as ProviderFormat,
          baseUrl: row.baseUrl,
          model: row.model,
          configured: true,
          platformDefaultAvailable: false,
          apiKeyPreview: `••••${row.apiKeyPreview}`,
          updatedAt: row.updatedAt.toISOString(),
        });
      } else if (defaults) {
        views.push({
          slot,
          format: defaults.format,
          baseUrl: defaults.baseUrl,
          model: defaults.model,
          configured: false,
          platformDefaultAvailable: Boolean(process.env[`LLM_PROVIDER_${slot}_API_KEY`]),
          apiKeyPreview: null,
          updatedAt: null,
        });
      } else {
        views.push({
          slot,
          format: 'openai',
          baseUrl: null,
          model: '',
          configured: false,
          platformDefaultAvailable: Boolean(process.env[`LLM_PROVIDER_${slot}_API_KEY`]),
          apiKeyPreview: null,
          updatedAt: null,
        });
      }
    }
    return views;
  }

  async upsert(
    tenantId: string,
    userId: string,
    slot: number,
    dto: UpsertLlmProviderSettingDto,
  ): Promise<LlmProviderSettingView> {
    assertValidSlot(slot);
    if (dto.format === 'openai' && !dto.baseUrl) {
      throw new BadRequestException('baseUrl is required for the "openai" format (any OpenAI-compatible /chat/completions endpoint)');
    }

    const row = await this.prisma.llmProviderSetting.upsert({
      where: { tenantId_slot: { tenantId, slot } },
      create: {
        tenantId,
        slot,
        format: dto.format,
        baseUrl: dto.baseUrl ?? null,
        model: dto.model,
        apiKeyEncrypted: encryptSecret(dto.apiKey),
        apiKeyPreview: previewSecret(dto.apiKey),
        updatedById: userId,
      },
      update: {
        format: dto.format,
        baseUrl: dto.baseUrl ?? null,
        model: dto.model,
        apiKeyEncrypted: encryptSecret(dto.apiKey),
        apiKeyPreview: previewSecret(dto.apiKey),
        updatedById: userId,
      },
    });

    return {
      slot: row.slot,
      format: row.format as ProviderFormat,
      baseUrl: row.baseUrl,
      model: row.model,
      configured: true,
      platformDefaultAvailable: false,
      apiKeyPreview: `••••${row.apiKeyPreview}`,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async remove(tenantId: string, slot: number): Promise<void> {
    assertValidSlot(slot);
    await this.prisma.llmProviderSetting.deleteMany({ where: { tenantId, slot } });
  }

  /**
   * Tests connectivity for a slot. If `dto` supplies a full credential (the in-progress form,
   * not yet saved), tests that; otherwise tests the tenant's already-saved row for this slot.
   */
  async testConnection(tenantId: string, slot: number, dto: TestLlmProviderSettingDto): Promise<{ ok: boolean; error?: string }> {
    assertValidSlot(slot);

    let client: LlmClient;
    if (dto.apiKey && dto.format && dto.model) {
      if (dto.format === 'openai' && !dto.baseUrl) {
        throw new BadRequestException('baseUrl is required for the "openai" format');
      }
      client = buildClient(dto.format, dto.apiKey, dto.baseUrl ?? '', dto.model);
    } else {
      const row = await this.prisma.llmProviderSetting.findUnique({ where: { tenantId_slot: { tenantId, slot } } });
      if (!row) {
        throw new NotFoundException(`No saved LLM provider setting for slot ${slot} — supply a full credential to test before saving`);
      }
      client = buildClient(row.format as ProviderFormat, decryptSecret(row.apiKeyEncrypted), row.baseUrl ?? '', row.model);
    }

    try {
      await client.complete(TEST_SYSTEM_PROMPT, TEST_USER_PROMPT);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Builds this tenant's provider chain from its own saved rows (ordered by slot). Falls back to
   * the platform-wide env-based chain when the tenant hasn't configured anything itself — same
   * behaviour as before this feature existed.
   */
  async resolveClientForTenant(tenantId: string): Promise<LlmClient | null> {
    const rows = await this.prisma.llmProviderSetting.findMany({ where: { tenantId }, orderBy: { slot: 'asc' } });
    if (rows.length === 0) {
      return resolveLlmClient();
    }

    const clients = rows.map((row) => buildClient(row.format as ProviderFormat, decryptSecret(row.apiKeyEncrypted), row.baseUrl ?? '', row.model));
    return clients.length === 1 ? clients[0] : new FallbackLlmClient(clients);
  }

  /**
   * The decrypted, ordered credential list for the Data Analysis microservice's "ai" mode —
   * forwarded over the existing internal HTTP call to services/data-analysis (see
   * DataAnalysisService.analyze) so a tenant's own UI-configured key is what actually runs the
   * analysis. Returns `null` when the tenant has configured nothing, so the Python side falls
   * back to its own env-based resolution exactly as before this feature existed.
   */
  async resolveProviderChainForAnalysis(tenantId: string): Promise<AnalysisProviderConfig[] | null> {
    const rows = await this.prisma.llmProviderSetting.findMany({ where: { tenantId }, orderBy: { slot: 'asc' } });
    if (rows.length === 0) {
      return null;
    }
    return rows.map((row) => ({
      format: row.format as ProviderFormat,
      baseUrl: row.baseUrl,
      model: row.model,
      apiKey: decryptSecret(row.apiKeyEncrypted),
    }));
  }
}
