import { BadGatewayException, BadRequestException, ServiceUnavailableException } from '@nestjs/common';

import { DataAnalysisService } from './data-analysis.service';

function fakeFile(): Express.Multer.File {
  return {
    buffer: Buffer.from('a,b\n1,2\n'),
    originalname: 'data.csv',
  } as Express.Multer.File;
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

    const service = new DataAnalysisService();
    const result = await service.analyze(fakeFile(), 'local');

    expect(result.mode).toBe('local');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://analysis.example.test/analyze');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
  });

  it('throws ServiceUnavailableException when the service is unreachable', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;
    const service = new DataAnalysisService();

    await expect(service.analyze(fakeFile(), 'local')).rejects.toThrow(ServiceUnavailableException);
  });

  it('throws ServiceUnavailableException when the service reports 503 (e.g. no LLM configured)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      json: async () => ({ detail: 'No LLM_PROVIDER_<n>_API_KEY is configured' }),
    }) as unknown as typeof fetch;
    const service = new DataAnalysisService();

    await expect(service.analyze(fakeFile(), 'ai')).rejects.toThrow(ServiceUnavailableException);
  });

  it('throws BadRequestException on a 4xx from the service', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: async () => ({ detail: 'Unsupported file type' }),
    }) as unknown as typeof fetch;
    const service = new DataAnalysisService();

    await expect(service.analyze(fakeFile(), 'local')).rejects.toThrow(BadRequestException);
  });

  it('throws BadGatewayException on an unexpected 5xx from the service', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => null,
    }) as unknown as typeof fetch;
    const service = new DataAnalysisService();

    await expect(service.analyze(fakeFile(), 'local')).rejects.toThrow(BadGatewayException);
  });
});
