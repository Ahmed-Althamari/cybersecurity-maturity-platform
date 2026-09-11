import type { LlmSettingsService } from '../../llm-settings/llm-settings.service';

import type { LlmClient } from './llm-client';
import { ImportMappingSuggesterService } from './mapping-suggester.service';

const TENANT_ID = 'tenant-1';

function fakeClient(response: string | Error): LlmClient {
  return {
    complete: jest.fn().mockImplementation(async () => {
      if (response instanceof Error) {
        throw response;
      }
      return response;
    }),
  };
}

function fakeLlmSettingsService(client: LlmClient | null): LlmSettingsService {
  return { resolveClientForTenant: jest.fn().mockResolvedValue(client) } as unknown as LlmSettingsService;
}

describe('ImportMappingSuggesterService', () => {
  it('reports unconfigured when no client is available for the tenant', async () => {
    const service = new ImportMappingSuggesterService(fakeLlmSettingsService(null));
    const result = await service.suggestMapping(['A'], [['1']], ['Current_Maturity'], TENANT_ID);
    expect(result).toEqual({ mapping: {}, configured: false });
  });

  it('reports configured without calling the client when nothing is unmapped', async () => {
    const client = fakeClient('{}');
    const service = new ImportMappingSuggesterService(fakeLlmSettingsService(client));
    const result = await service.suggestMapping(['A', 'B'], [['1', '2']], [], TENANT_ID);
    expect(result).toEqual({ mapping: {}, configured: true });
    expect(client.complete).not.toHaveBeenCalled();
  });

  it('accepts a suggestion naming a real unmapped column and a real header', async () => {
    const client = fakeClient(JSON.stringify({ Current_Maturity: 'Maturity Score (Now)' }));
    const service = new ImportMappingSuggesterService(fakeLlmSettingsService(client));
    const result = await service.suggestMapping(
      ['Control ID', 'Maturity Score (Now)'],
      [['AC-1', '3']],
      ['Current_Maturity'],
      TENANT_ID,
    );
    expect(result).toEqual({ mapping: { Current_Maturity: 'Maturity Score (Now)' }, configured: true });
  });

  it('drops a suggestion for a column that was not actually unmapped', async () => {
    const client = fakeClient(JSON.stringify({ Framework: 'Some Header' }));
    const service = new ImportMappingSuggesterService(fakeLlmSettingsService(client));
    const result = await service.suggestMapping(['Some Header'], [['x']], ['Current_Maturity'], TENANT_ID);
    expect(result).toEqual({ mapping: {}, configured: true });
  });

  it('drops a suggestion naming a header that does not exist in the file', async () => {
    const client = fakeClient(JSON.stringify({ Current_Maturity: 'A header that was never there' }));
    const service = new ImportMappingSuggesterService(fakeLlmSettingsService(client));
    const result = await service.suggestMapping(['Real Header'], [['x']], ['Current_Maturity'], TENANT_ID);
    expect(result).toEqual({ mapping: {}, configured: true });
  });

  it('extracts JSON embedded in prose when the model ignores json-only instructions', async () => {
    const client = fakeClient(`Sure, here you go:\n{"Current_Maturity": "Score"}\nHope that helps!`);
    const service = new ImportMappingSuggesterService(fakeLlmSettingsService(client));
    const result = await service.suggestMapping(['Score'], [['3']], ['Current_Maturity'], TENANT_ID);
    expect(result).toEqual({ mapping: { Current_Maturity: 'Score' }, configured: true });
  });

  it('degrades to an empty mapping, never throws, when the client errors', async () => {
    const client = fakeClient(new Error('network down'));
    const service = new ImportMappingSuggesterService(fakeLlmSettingsService(client));
    const result = await service.suggestMapping(['A'], [['1']], ['Current_Maturity'], TENANT_ID);
    expect(result).toEqual({ mapping: {}, configured: true });
  });

  it('degrades to an empty mapping when the client returns unparseable garbage', async () => {
    const client = fakeClient('not json at all');
    const service = new ImportMappingSuggesterService(fakeLlmSettingsService(client));
    const result = await service.suggestMapping(['A'], [['1']], ['Current_Maturity'], TENANT_ID);
    expect(result).toEqual({ mapping: {}, configured: true });
  });

  it('resolves the client scoped to the given tenant', async () => {
    const client = fakeClient('{}');
    const llmSettingsService = fakeLlmSettingsService(client);
    const service = new ImportMappingSuggesterService(llmSettingsService);
    await service.suggestMapping(['A'], [['1']], [], TENANT_ID);
    expect(llmSettingsService.resolveClientForTenant).toHaveBeenCalledWith(TENANT_ID);
  });
});
