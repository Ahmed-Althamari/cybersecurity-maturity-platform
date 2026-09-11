import type { CanonicalColumn, ColumnMapping } from '@cmmp/import-engine';
import { Injectable } from '@nestjs/common';

import { LlmSettingsService } from '../../llm-settings/llm-settings.service';

import { llmClientLogger } from './llm-client';

const SAMPLE_ROW_COUNT = 5;
const MAX_HEADER_LENGTH = 200;

const SYSTEM_PROMPT = `You map spreadsheet column headers to a fixed set of canonical field names for a \
cybersecurity maturity assessment import tool. Given the file's actual headers, a few sample data \
rows, and the canonical fields still unmapped by exact/alias matching, reply with ONLY a JSON object \
mapping canonical field name -> the single best-matching header string from the file. Omit a \
canonical field entirely if nothing in the file plausibly corresponds to it — never invent a header \
that isn't in the provided list, and never guess when unsure. Reply with JSON only, no prose.`;

export interface MappingSuggestionResult {
  mapping: ColumnMapping;
  /** Whether an LLM provider was available for this tenant — independent of whether it actually produced any suggestions. */
  configured: boolean;
}

/**
 * Best-effort LLM assist for columns `autoMapColumns` (exact-name/alias matching) couldn't
 * resolve — e.g. a file using "Maturity Score (Now)" instead of any known alias for
 * `Current_Maturity`. Never blocks or fails an import: any error, timeout, or malformed response
 * here just means fewer columns get suggested, not a broken import.
 *
 * Resolves its LLM client per tenant via `LlmSettingsService` — a tenant's own UI-configured
 * credentials (apps/web/pages/settings/ai.tsx) take over when present, otherwise it falls back
 * to the platform-wide env-based chain, exactly as this feature behaved before tenants could
 * configure their own.
 */
@Injectable()
export class ImportMappingSuggesterService {
  constructor(private readonly llmSettingsService: LlmSettingsService) {}

  async suggestMapping(
    headers: string[],
    sampleRows: string[][],
    unmappedColumns: CanonicalColumn[],
    tenantId: string,
  ): Promise<MappingSuggestionResult> {
    const client = await this.llmSettingsService.resolveClientForTenant(tenantId);
    if (!client) {
      return { mapping: {}, configured: false };
    }
    if (unmappedColumns.length === 0) {
      return { mapping: {}, configured: true };
    }

    // A capped tenant degrades the same as any other failure mode here — this is a best-effort
    // assist, not something worth surfacing a hard error over on an otherwise-working import.
    try {
      await this.llmSettingsService.assertUnderUsageLimit(tenantId);
    } catch (error) {
      llmClientLogger.warn(`Column-mapping suggestion skipped: ${error instanceof Error ? error.message : String(error)}`);
      return { mapping: {}, configured: true };
    }

    try {
      const userPrompt = this.buildUserPrompt(headers, sampleRows, unmappedColumns);
      const raw = await client.complete(SYSTEM_PROMPT, userPrompt);
      void this.llmSettingsService.recordUsage(tenantId, 'import-mapping', true);
      return { mapping: this.parseAndValidate(raw, headers, unmappedColumns), configured: true };
    } catch (error) {
      void this.llmSettingsService.recordUsage(tenantId, 'import-mapping', false);
      llmClientLogger.warn(`Column-mapping suggestion skipped: ${error instanceof Error ? error.message : String(error)}`);
      return { mapping: {}, configured: true };
    }
  }

  private buildUserPrompt(headers: string[], sampleRows: string[][], unmappedColumns: CanonicalColumn[]): string {
    const truncatedHeaders = headers.map((header) => header.slice(0, MAX_HEADER_LENGTH));
    const samples = sampleRows.slice(0, SAMPLE_ROW_COUNT);
    return JSON.stringify({
      fileHeaders: truncatedHeaders,
      sampleRows: samples,
      unmappedCanonicalFields: unmappedColumns,
    });
  }

  /** Only accepts suggestions that name a real, unmapped canonical field and an actual file header — anything else is dropped, not trusted verbatim. */
  private parseAndValidate(raw: string, headers: string[], unmappedColumns: CanonicalColumn[]): ColumnMapping {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) {
        return {};
      }
      parsed = JSON.parse(match[0]);
    }

    if (typeof parsed !== 'object' || parsed === null) {
      return {};
    }

    const mapping: ColumnMapping = {};
    const unmappedSet = new Set<string>(unmappedColumns);
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!unmappedSet.has(key) || typeof value !== 'string') {
        continue;
      }
      if (headers.includes(value)) {
        mapping[key as CanonicalColumn] = value;
      }
    }
    return mapping;
  }
}
