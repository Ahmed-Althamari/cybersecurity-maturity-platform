import { Logger } from '@nestjs/common';

/**
 * Deliberately provider-agnostic: any OpenAI-compatible `/chat/completions`
 * endpoint works here (OpenRouter, Together, Groq, a self-hosted vLLM/Ollama
 * server), which is what lets `LLM_MODEL` point at an open-weight model —
 * Hermes by default — without this client caring who's actually serving it.
 */
export interface LlmClient {
  complete(systemPrompt: string, userPrompt: string): Promise<string>;
}

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
// OpenRouter's free tier has carried a no-cost Hermes 3 405B slot; provider catalogs change,
// so treat this default as a starting point to verify against the current catalog, not a promise
// — override with LLM_MODEL for whatever's actually free/available when this runs.
const DEFAULT_MODEL = 'nousresearch/hermes-3-llama-3.1-405b:free';
const REQUEST_TIMEOUT_MS = 15_000;

export class HttpLlmClient implements LlmClient {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string = DEFAULT_BASE_URL,
    private readonly model: string = DEFAULT_MODEL,
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

/** DI token for `LlmClient | null` — plain interfaces have no runtime identity, so Nest can't use the type itself as a token. */
export const LLM_CLIENT = Symbol('LLM_CLIENT');

/**
 * Reads LLM_API_KEY/LLM_BASE_URL/LLM_MODEL from the environment. Returns `null` — not a
 * throwing stub — when no key is configured, so every caller's fallback is "skip the
 * suggestion, keep auto-mapping" rather than a startup crash over an optional feature.
 */
export function resolveLlmClient(): LlmClient | null {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new HttpLlmClient(apiKey, process.env.LLM_BASE_URL || DEFAULT_BASE_URL, process.env.LLM_MODEL || DEFAULT_MODEL);
}

export const llmClientLogger = new Logger('ImportMappingSuggester');
