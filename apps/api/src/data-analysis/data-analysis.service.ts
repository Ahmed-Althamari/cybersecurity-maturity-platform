import { BadGatewayException, BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';

import { LlmSettingsService } from '../llm-settings/llm-settings.service';

export type AnalysisMode = 'local' | 'ai';

export interface AnalysisColumn {
  name: string;
  dtype: string;
}

export interface AnalysisChart {
  title: string;
  imageBase64: string;
}

export interface AnalysisResult {
  mode: AnalysisMode;
  rowCount: number;
  columnCount: number;
  columns: AnalysisColumn[];
  charts: AnalysisChart[];
  answer: string | null;
  table: Record<string, unknown>[] | null;
  error: string | null;
}

// AutoViz (local mode) and PandasAI's code-gen retries (ai mode) can both legitimately take
// well over the platform's usual few-second API budget on a large sheet.
const REQUEST_TIMEOUT_MS = 120_000;

/**
 * Proxies to the isolated data-analysis microservice (services/data-analysis/, Python/FastAPI) —
 * this service holds no analysis logic of its own and touches none of the platform's own
 * Prisma models. It exists purely so the Node API can enforce auth on this feature the same way
 * as every other endpoint, without pulling pandas/PandasAI/AutoViz's Python dependency tree into
 * the Node process.
 */
@Injectable()
export class DataAnalysisService {
  private readonly serviceUrl = process.env.DATA_ANALYSIS_SERVICE_URL || 'http://localhost:8000';

  constructor(private readonly llmSettingsService: LlmSettingsService) {}

  async analyze(
    file: Express.Multer.File,
    mode: AnalysisMode,
    question: string | undefined,
    tenantId: string,
    slot?: number,
  ): Promise<AnalysisResult> {
    const form = new FormData();
    // Buffer's `.buffer` is typed as ArrayBufferLike (it can back onto a SharedArrayBuffer),
    // which Blob's constructor doesn't accept — Uint8Array.from() copies into a plain,
    // Blob-compatible ArrayBuffer-backed view.
    form.append('file', new Blob([Uint8Array.from(file.buffer)]), file.originalname);
    form.append('mode', mode);
    if (question) {
      form.append('question', question);
    }

    // "ai" mode only: forward this tenant's own UI-configured provider chain (see
    // apps/web/pages/settings/ai.tsx) if it has one, so the analysis actually runs on the
    // tenant's own credentials rather than the platform-wide env vars. `null` here (nothing
    // configured) means "let the Python service fall back to its own env-based resolution",
    // identical to this feature's behaviour before UI-configurable settings existed. `slot`,
    // when given, restricts this to the one provider the user picked instead of the default
    // full fallback chain.
    //
    // Checked before ever calling the Python service (an explicit, user-initiated request,
    // unlike the best-effort import-mapping suggester) — a capped tenant gets a clear 429
    // instead of a wasted round trip.
    if (mode === 'ai') {
      await this.llmSettingsService.assertUnderUsageLimit(tenantId);
      const providers = await this.llmSettingsService.resolveProviderChainForAnalysis(tenantId, slot);
      if (providers) {
        // snake_case to match the Python service's FastAPI Form field name (main.py's `llm_providers`).
        form.append('llm_providers', JSON.stringify(providers));
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(`${this.serviceUrl}/analyze`, {
        method: 'POST',
        body: form,
        signal: controller.signal,
      });
    } catch (error) {
      throw new ServiceUnavailableException(
        `Data analysis service is unreachable: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      clearTimeout(timeout);
    }

    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const detail =
        body && typeof body === 'object' && 'detail' in body ? String((body as { detail: unknown }).detail) : response.statusText;
      if (response.status === 503) {
        throw new ServiceUnavailableException(detail);
      }
      if (response.status >= 400 && response.status < 500) {
        throw new BadRequestException(detail);
      }
      throw new BadGatewayException(`Data analysis service returned ${response.status}: ${detail}`);
    }

    // Only a 200 response reaching here means a provider was actually invoked (a 503 above means
    // LlmNotConfiguredError — no attempt was ever made, so it's not counted). The response's own
    // `error` field distinguishes a successful call from one that reached a provider and failed.
    if (mode === 'ai') {
      const analysisError = body && typeof body === 'object' && 'error' in body ? (body as AnalysisResult).error : null;
      void this.llmSettingsService.recordUsage(tenantId, 'data-analysis', !analysisError);
    }

    return body as AnalysisResult;
  }
}
