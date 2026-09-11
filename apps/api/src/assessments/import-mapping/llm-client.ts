import Anthropic from '@anthropic-ai/sdk';
import { Logger } from '@nestjs/common';

/**
 * One client per wire format a provider speaks, all satisfying the same narrow interface —
 * `ImportMappingSuggesterService` (and everything below it) only ever calls `complete()` and
 * doesn't care which format or provider answered. Adding a third format (e.g. Google's Gemini
 * API) later is a new class implementing this interface plus a case in `buildClient()` below —
 * nothing else in the suggestion pipeline changes.
 */
export interface LlmClient {
  complete(systemPrompt: string, userPrompt: string): Promise<string>;
}

const REQUEST_TIMEOUT_MS = 15_000;

/** Any OpenAI-compatible `/chat/completions` endpoint — OpenRouter, Groq, Together, a self-hosted vLLM/Ollama server, OpenAI itself. */
export class OpenAiCompatibleClient implements LlmClient {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
    private readonly model: string,
  ) {}

  async complete(systemPrompt: string, userPrompt: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`LLM endpoint returned ${response.status}: ${await response.text()}`);
      }

      const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
      const content = body.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('LLM response had no message content');
      }
      return content;
    } finally {
      clearTimeout(timeout);
    }
  }
}

/**
 * A JSON object of arbitrary string keys/values — deliberately loose, as a plain JSON Schema
 * (not a Zod schema: the SDK's `zodOutputFormat()` helper is typed against zod's newer 'zod/v4'
 * core specifically, a different type identity than the classic 'zod' import this repo uses
 * everywhere else, and pulling that in for one loose schema wasn't worth the friction). The real
 * per-key validation (is this actually one of the unmapped canonical columns? is the value
 * actually one of the file's headers?) happens in `ImportMappingSuggesterService.parseAndValidate`
 * on the raw text either client returns, identically regardless of which one produced it.
 */
const MAPPING_JSON_SCHEMA: Anthropic.Messages.JSONOutputFormat = {
  type: 'json_schema',
  schema: { type: 'object', additionalProperties: { type: 'string' } },
};

/**
 * Anthropic's Messages API, via the official `@anthropic-ai/sdk` (not raw HTTP — Claude doesn't
 * speak the OpenAI wire format `OpenAiCompatibleClient` above targets, and the SDK is the
 * supported way to call it). `output_config.format` constrains the response to the JSON Schema
 * above — Anthropic's equivalent of OpenAI's `response_format: {type: 'json_object'}` — instead
 * of trusting the model to emit valid JSON unprompted.
 */
export class AnthropicMessagesClient implements LlmClient {
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    private readonly model: string,
    baseUrl?: string,
  ) {
    this.client = new Anthropic({ apiKey, ...(baseUrl ? { baseURL: baseUrl } : {}) });
  }

  async complete(systemPrompt: string, userPrompt: string): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      output_config: { format: MAPPING_JSON_SCHEMA },
    });

    const textBlock = response.content.find((block): block is Anthropic.Messages.TextBlock => block.type === 'text');
    if (!textBlock) {
      throw new Error(`Claude response had no text content (stop_reason: ${response.stop_reason})`);
    }
    return textBlock.text;
  }
}

/**
 * Tries each configured client in order, only moving to the next on a real failure
 * (error/timeout) — the first one that returns wins. Never blocks: if every provider in the
 * chain fails, the last error propagates to the caller's existing catch-and-degrade-to-empty-
 * mapping handling (see `ImportMappingSuggesterService.suggestMapping`), same as a single
 * misbehaving provider would today.
 */
export class FallbackLlmClient implements LlmClient {
  constructor(private readonly clients: LlmClient[]) {}

  async complete(systemPrompt: string, userPrompt: string): Promise<string> {
    let lastError: unknown;
    for (const client of this.clients) {
      try {
        return await client.complete(systemPrompt, userPrompt);
      } catch (error) {
        lastError = error;
        llmClientLogger.warn(`Provider failed, trying next in the fallback chain: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    throw lastError;
  }
}

export type ProviderFormat = 'openai' | 'anthropic';

export interface ProviderDefaults {
  format: ProviderFormat;
  baseUrl: string;
  model: string;
}

// Free-tier catalogs churn fast enough that hardcoding a specific model (e.g. a named Hermes
// slot) is a real trap — one such default broke within weeks of being written here. These are
// starting points for an unconfigured slot, each overridable per-field via env vars.
export const SLOT_DEFAULTS: Record<number, ProviderDefaults> = {
  // OpenRouter's own router-level free entry point — picks among whatever's currently free
  // rather than naming one model, so it survives that churn.
  1: { format: 'openai', baseUrl: 'https://openrouter.ai/api/v1', model: 'openrouter/free' },
  // Groq's free tier — no card required, real named open-weight models, fast inference.
  2: { format: 'openai', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
  // Paid top-tier fallback — only activates if LLM_PROVIDER_3_API_KEY is actually set.
  3: { format: 'anthropic', baseUrl: 'https://api.anthropic.com', model: 'claude-opus-5' },
};
export const MAX_PROVIDER_SLOTS = 5;

/** Exported so apps/api/src/llm-settings can build the same client types from DB-stored, tenant-owned credentials instead of env vars. */
export function buildClient(format: ProviderFormat, apiKey: string, baseUrl: string, model: string): LlmClient {
  switch (format) {
    case 'anthropic':
      return new AnthropicMessagesClient(apiKey, model, baseUrl);
    case 'openai':
      return new OpenAiCompatibleClient(apiKey, baseUrl, model);
  }
}

/**
 * Reads an ordered chain of providers from `LLM_PROVIDER_<n>_*` env vars (n = 1..5) — each slot
 * needs at minimum `LLM_PROVIDER_<n>_API_KEY` to activate; `_FORMAT`/`_BASE_URL`/`_MODEL` fall
 * back to `SLOT_DEFAULTS` for slots 1-3, or must be set explicitly for slots 4-5. Returns `null`
 * — not a throwing stub — when no slot is configured at all, so every caller's fallback is "skip
 * the suggestion, keep auto-mapping" rather than a startup crash over an optional feature. With
 * exactly one slot configured, returns that client directly (no pointless single-entry chain);
 * with more than one, wraps them in a `FallbackLlmClient` tried in slot order.
 */
export function resolveLlmClient(): LlmClient | null {
  const clients: LlmClient[] = [];

  for (let slot = 1; slot <= MAX_PROVIDER_SLOTS; slot++) {
    const apiKey = process.env[`LLM_PROVIDER_${slot}_API_KEY`];
    if (!apiKey) {
      continue;
    }
    const defaults = SLOT_DEFAULTS[slot];
    const format = (process.env[`LLM_PROVIDER_${slot}_FORMAT`] || defaults?.format) as ProviderFormat | undefined;
    const baseUrl = process.env[`LLM_PROVIDER_${slot}_BASE_URL`] || defaults?.baseUrl;
    const model = process.env[`LLM_PROVIDER_${slot}_MODEL`] || defaults?.model;

    if (!format || !baseUrl || !model) {
      llmClientLogger.warn(`LLM_PROVIDER_${slot}_API_KEY is set but FORMAT/BASE_URL/MODEL has no default for this slot and none was provided — skipping.`);
      continue;
    }
    clients.push(buildClient(format, apiKey, baseUrl, model));
  }

  if (clients.length === 0) {
    return null;
  }
  return clients.length === 1 ? clients[0] : new FallbackLlmClient(clients);
}

export const llmClientLogger = new Logger('ImportMappingSuggester');
