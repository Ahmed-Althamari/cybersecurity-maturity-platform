import {
  AnthropicMessagesClient,
  FallbackLlmClient,
  OpenAiCompatibleClient,
  resolveLlmClient,
  type LlmClient,
} from './llm-client';

const PROVIDER_ENV_KEYS = Array.from({ length: 5 }, (_, i) => i + 1).flatMap((n) => [
  `LLM_PROVIDER_${n}_API_KEY`,
  `LLM_PROVIDER_${n}_FORMAT`,
  `LLM_PROVIDER_${n}_BASE_URL`,
  `LLM_PROVIDER_${n}_MODEL`,
]);

describe('FallbackLlmClient', () => {
  function client(behavior: (() => Promise<string>) | Error): LlmClient {
    return { complete: jest.fn(async () => (behavior instanceof Error ? Promise.reject(behavior) : behavior())) };
  }

  it('returns the first client that succeeds', async () => {
    const first = client(new Error('down'));
    const second = client(async () => '{"Current_Maturity":"Score"}');
    const chain = new FallbackLlmClient([first, second]);

    await expect(chain.complete('sys', 'user')).resolves.toBe('{"Current_Maturity":"Score"}');
    expect(first.complete).toHaveBeenCalledTimes(1);
    expect(second.complete).toHaveBeenCalledTimes(1);
  });

  it('never calls a later client once an earlier one succeeds', async () => {
    const first = client(async () => 'ok');
    const second = client(new Error('should never run'));
    const chain = new FallbackLlmClient([first, second]);

    await chain.complete('sys', 'user');
    expect(second.complete).not.toHaveBeenCalled();
  });

  it('propagates the last error when every client fails', async () => {
    const first = client(new Error('first down'));
    const second = client(new Error('second down too'));
    const chain = new FallbackLlmClient([first, second]);

    await expect(chain.complete('sys', 'user')).rejects.toThrow('second down too');
  });
});

describe('OpenAiCompatibleClient', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('posts to /chat/completions and returns the message content', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"Current_Maturity":"Score"}' } }] }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const openaiClient = new OpenAiCompatibleClient('key', 'https://example.test/v1', 'some-model');
    const result = await openaiClient.complete('system prompt', 'user prompt');

    expect(result).toBe('{"Current_Maturity":"Score"}');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://example.test/v1/chat/completions');
    expect(JSON.parse(init.body).model).toBe('some-model');
    expect(init.headers.Authorization).toBe('Bearer key');
  });

  it('throws when the endpoint returns a non-ok response', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 429, text: async () => 'rate limited' }) as unknown as typeof fetch;
    const openaiClient = new OpenAiCompatibleClient('key', 'https://example.test/v1', 'some-model');

    await expect(openaiClient.complete('sys', 'user')).rejects.toThrow('429');
  });
});

describe('AnthropicMessagesClient', () => {
  it('returns the text block content on success', async () => {
    const anthropicClient = new AnthropicMessagesClient('key', 'claude-opus-5');
    (anthropicClient as unknown as { client: { messages: { create: jest.Mock } } }).client = {
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ type: 'text', text: '{"Current_Maturity":"Score"}' }],
          stop_reason: 'end_turn',
        }),
      },
    };

    const result = await anthropicClient.complete('sys', 'user');
    expect(JSON.parse(result)).toEqual({ Current_Maturity: 'Score' });
  });

  it('throws when the response has no text content (e.g. a refusal)', async () => {
    const anthropicClient = new AnthropicMessagesClient('key', 'claude-opus-5');
    (anthropicClient as unknown as { client: { messages: { create: jest.Mock } } }).client = {
      messages: { create: jest.fn().mockResolvedValue({ content: [], stop_reason: 'refusal' }) },
    };

    await expect(anthropicClient.complete('sys', 'user')).rejects.toThrow('refusal');
  });
});

describe('resolveLlmClient', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    for (const key of PROVIDER_ENV_KEYS) {
      delete process.env[key];
    }
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('returns null when no provider slot is configured', () => {
    expect(resolveLlmClient()).toBeNull();
  });

  it('returns a single client directly when only one slot is configured, using slot 1 defaults', () => {
    process.env.LLM_PROVIDER_1_API_KEY = 'sk-or-test';
    const resolved = resolveLlmClient();
    expect(resolved).toBeInstanceOf(OpenAiCompatibleClient);
  });

  it('wraps more than one configured slot in a FallbackLlmClient', () => {
    process.env.LLM_PROVIDER_1_API_KEY = 'sk-or-test';
    process.env.LLM_PROVIDER_2_API_KEY = 'gsk-test';
    expect(resolveLlmClient()).toBeInstanceOf(FallbackLlmClient);
  });

  it('builds an AnthropicMessagesClient for a slot 3 key using its defaults', () => {
    process.env.LLM_PROVIDER_3_API_KEY = 'sk-ant-test';
    expect(resolveLlmClient()).toBeInstanceOf(AnthropicMessagesClient);
  });

  it('respects an explicit FORMAT/BASE_URL/MODEL override on an otherwise-defaulted slot', () => {
    process.env.LLM_PROVIDER_1_API_KEY = 'key';
    process.env.LLM_PROVIDER_1_FORMAT = 'anthropic';
    process.env.LLM_PROVIDER_1_MODEL = 'claude-opus-5';
    expect(resolveLlmClient()).toBeInstanceOf(AnthropicMessagesClient);
  });

  it('skips a slot beyond the defaulted ones (4/5) with no explicit format, rather than throwing', () => {
    process.env.LLM_PROVIDER_4_API_KEY = 'key-with-no-defaults';
    expect(resolveLlmClient()).toBeNull();
  });

  it('activates a non-defaulted slot once format/base_url/model are all given explicitly', () => {
    process.env.LLM_PROVIDER_4_API_KEY = 'key';
    process.env.LLM_PROVIDER_4_FORMAT = 'openai';
    process.env.LLM_PROVIDER_4_BASE_URL = 'https://example.test/v1';
    process.env.LLM_PROVIDER_4_MODEL = 'custom-model';
    expect(resolveLlmClient()).toBeInstanceOf(OpenAiCompatibleClient);
  });
});
