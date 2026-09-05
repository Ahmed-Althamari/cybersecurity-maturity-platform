import { BadGatewayException, BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';

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

  async analyze(file: Express.Multer.File, mode: AnalysisMode, question?: string): Promise<AnalysisResult> {
    const form = new FormData();
    // Buffer's `.buffer` is typed as ArrayBufferLike (it can back onto a SharedArrayBuffer),
    // which Blob's constructor doesn't accept — Uint8Array.from() copies into a plain,
    // Blob-compatible ArrayBuffer-backed view.
    form.append('file', new Blob([Uint8Array.from(file.buffer)]), file.originalname);
    form.append('mode', mode);
    if (question) {
      form.append('question', question);
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
    return body as AnalysisResult;
  }
}
