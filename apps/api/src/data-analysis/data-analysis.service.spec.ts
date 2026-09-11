import { BadGatewayException, BadRequestException, ServiceUnavailableException } from '@nestjs/common';

import type { LlmSettingsService } from '../llm-settings/llm-settings.service';

import { DataAnalysisService } from './data-analysis.service';

function fakeFile(): Express.Multer.File {
  return {
    buffer: Buffer.from('a,b\n1,2\n'),
    originalname: 'data.csv',
  } as Express.Multer.File;
}

const TENANT_ID = 'tenant-1';

function fakeLlmSettingsService(providers: unknown = null): LlmSettingsService {
  return {
    resolveProviderChainForAnalysis: jest.fn().mockResolvedValue(providers),
    assertUnderUsageLimit: jest.fn().mockResolvedValue(undefined),
    recordUsage: jest.fn().mockResolvedValue(undefined),
  } as unknown as LlmSettingsService;
}

describe('DataAnalysisService', () => {
  const originalFetch = global.fetch;
  const originalEnv = process.env.DATA_ANALYSIS_SERVICE_URL;

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.DATA_ANALYSIS_SERVICE_URL = originalEnv;
  });

  it('posts the file, mode and question to the configured service URL and returns its JSON body', async () => {
    process.env.DATA_ANALYSIS_SERVICE_URL = 'https://analysis.example.test';
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ mode: 'local', rowCount: 1, columnCount: 2, columns: [], charts: [], answer: null, table: null, error: null }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const service = new DataAnalysisService(fakeLlmSettingsService());
    const result = await service.analyze(fakeFile(), 'local', undefined, TENANT_ID);

    expect(result.mode).toBe('local');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://analysis.example.test/analyze');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
  });

  it('does not look up or forward a provider chain in "local" mode', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ mode: 'local', rowCount: 1, columnCount: 2, columns: [], charts: [], answer: null, table: null, error: null }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const llmSettingsService = fakeLlmSettingsService();

    const service = new DataAnalysisService(llmSettingsService);
    await service.analyze(fakeFile(), 'local', undefined, TENANT_ID);

    expect(llmSettingsService.resolveProviderChainForAnalysis).not.toHaveBeenCalled();
  });

  it('forwards the tenant\'s configured provider chain as a form field in "ai" mode', async () => {
    const providers = [{ format: 'anthropic', baseUrl: null, model: 'claude-opus-5', apiKey: 'sk-test' }];
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ mode: 'ai', rowCount: 1, columnCount: 2, columns: [], charts: [], answer: 'ok', table: null, error: null }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const service = new DataAnalysisService(fakeLlmSettingsService(providers));
    await service.analyze(fakeFile(), 'ai', undefined, TENANT_ID);

    const [, init] = fetchMock.mock.calls[0];
    const form = init.body as FormData;
    expect(form.get('llm_providers')).toBe(JSON.stringify(providers));
  });

  it('passes the picked slot through to resolveProviderChainForAnalysis', async () => {
    const providers = [{ format: 'openai', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', apiKey: 'gsk-test' }];
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ mode: 'ai', rowCount: 1, columnCount: 2, columns: [], charts: [], answer: 'ok', table: null, error: null }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const llmSettingsService = fakeLlmSettingsService(providers);

    const service = new DataAnalysisService(llmSettingsService);
    await service.analyze(fakeFile(), 'ai', undefined, TENANT_ID, 2);

    expect(llmSettingsService.resolveProviderChainForAnalysis).toHaveBeenCalledWith(TENANT_ID, 2);
    const [, init] = fetchMock.mock.calls[0];
    const form = init.body as FormData;
    expect(form.get('llm_providers')).toBe(JSON.stringify(providers));
  });

  it('omits the llmProviders field in "ai" mode when the tenant has configured nothing', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ mode: 'ai', rowCount: 1, columnCount: 2, columns: [], charts: [], answer: 'ok', table: null, error: null }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const service = new DataAnalysisService(fakeLlmSettingsService(null));
    await service.analyze(fakeFile(), 'ai', undefined, TENANT_ID);

    const [, init] = fetchMock.mock.calls[0];
    const form = init.body as FormData;
    expect(form.get('llm_providers')).toBeNull();
  });

  it('checks the usage limit before ever calling the service in "ai" mode', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const llmSettingsService = fakeLlmSettingsService();
    llmSettingsService.assertUnderUsageLimit = jest.fn().mockRejectedValue(new Error('Daily AI usage limit of 10 calls reached'));
    const service = new DataAnalysisService(llmSettingsService);

    await expect(service.analyze(fakeFile(), 'ai', undefined, TENANT_ID)).rejects.toThrow('Daily AI usage limit');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not check the usage limit in "local" mode', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ mode: 'local', rowCount: 1, columnCount: 2, columns: [], charts: [], answer: null, table: null, error: null }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const llmSettingsService = fakeLlmSettingsService();

    const service = new DataAnalysisService(llmSettingsService);
    await service.analyze(fakeFile(), 'local', undefined, TENANT_ID);

    expect(llmSettingsService.assertUnderUsageLimit).not.toHaveBeenCalled();
  });

  it('records a successful usage event when "ai" mode returns a clean result', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ mode: 'ai', rowCount: 1, columnCount: 2, columns: [], charts: [], answer: 'ok', table: null, error: null }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const llmSettingsService = fakeLlmSettingsService();

    const service = new DataAnalysisService(llmSettingsService);
    await service.analyze(fakeFile(), 'ai', undefined, TENANT_ID);

    expect(llmSettingsService.recordUsage).toHaveBeenCalledWith(TENANT_ID, 'data-analysis', true);
  });

  it('records a failed usage event when "ai" mode reaches a provider but returns an error', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ mode: 'ai', rowCount: 1, columnCount: 2, columns: [], charts: [], answer: null, table: null, error: 'boom' }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const llmSettingsService = fakeLlmSettingsService();

    const service = new DataAnalysisService(llmSettingsService);
    await service.analyze(fakeFile(), 'ai', undefined, TENANT_ID);

    expect(llmSettingsService.recordUsage).toHaveBeenCalledWith(TENANT_ID, 'data-analysis', false);
  });

  it('does not record usage in "local" mode', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ mode: 'local', rowCount: 1, columnCount: 2, columns: [], charts: [], answer: null, table: null, error: null }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const llmSettingsService = fakeLlmSettingsService();

    const service = new DataAnalysisService(llmSettingsService);
    await service.analyze(fakeFile(), 'local', undefined, TENANT_ID);

    expect(llmSettingsService.recordUsage).not.toHaveBeenCalled();
  });

  it('does not record usage when the service reports 503 (no attempt was made)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      json: async () => ({ detail: 'No LLM_PROVIDER_<n>_API_KEY is configured' }),
    }) as unknown as typeof fetch;
    const llmSettingsService = fakeLlmSettingsService();
    const service = new DataAnalysisService(llmSettingsService);

    await expect(service.analyze(fakeFile(), 'ai', undefined, TENANT_ID)).rejects.toThrow(ServiceUnavailableException);
    expect(llmSettingsService.recordUsage).not.toHaveBeenCalled();
  });

  it('throws ServiceUnavailableException when the service is unreachable', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;
    const service = new DataAnalysisService(fakeLlmSettingsService());

    await expect(service.analyze(fakeFile(), 'local', undefined, TENANT_ID)).rejects.toThrow(ServiceUnavailableException);
  });

  it('throws ServiceUnavailableException when the service reports 503 (e.g. no LLM configured)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      json: async () => ({ detail: 'No LLM_PROVIDER_<n>_API_KEY is configured' }),
    }) as unknown as typeof fetch;
    const service = new DataAnalysisService(fakeLlmSettingsService());

    await expect(service.analyze(fakeFile(), 'ai', undefined, TENANT_ID)).rejects.toThrow(ServiceUnavailableException);
  });

  it('throws BadRequestException on a 4xx from the service', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: async () => ({ detail: 'Unsupported file type' }),
    }) as unknown as typeof fetch;
    const service = new DataAnalysisService(fakeLlmSettingsService());

    await expect(service.analyze(fakeFile(), 'local', undefined, TENANT_ID)).rejects.toThrow(BadRequestException);
  });

  it('throws BadGatewayException on an unexpected 5xx from the service', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => null,
    }) as unknown as typeof fetch;
    const service = new DataAnalysisService(fakeLlmSettingsService());

    await expect(service.analyze(fakeFile(), 'local', undefined, TENANT_ID)).rejects.toThrow(BadGatewayException);
  });
});
