import { Logger } from '@nestjs/common';

/**
 * Deliberately provider-agnostic: any OpenAI-compatible `/chat/completions`
 * endpoint works here (OpenRouter, Groq, Together, a self-hosted vLLM/Ollama
 * server) — `LLM_BASE_URL`/`LLM_MODEL` point this at whichever open-weight
 * model is actually free/available when it runs, without this client caring
 * who's serving it.
 */
export interface LlmClient {
  complete(systemPrompt: string, userPrompt: string): Promise<string>;
}

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
// Free-tier catalogs on OpenRouter churn fast enough that hardcoding a specific model (e.g. a
// named Hermes slot) is a real trap — one such default broke within weeks of being written here.
// `openrouter/free` is OpenRouter's own router-level entry point: it picks among whatever's
// currently free rather than naming one model, so it survives that churn. Point LLM_BASE_URL at
// https://api.groq.com/openai/v1 with an explicit LLM_MODEL (e.g. a current Llama/Mixtral/Qwen
// model — also genuinely free, no card required) as a fallback if OpenRouter's free tier is
// rate-limited or unavailable.
const DEFAULT_MODEL = 'openrouter/free';
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
