import { ConfigService } from '@nestjs/config';

import { AiMappingService } from './ai-mapping.service';

const mockCreate = jest.fn();

jest.mock('@anthropic-ai/sdk', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      messages: { create: mockCreate },
    })),
  };
});

function configWithKey(apiKey: string | undefined): ConfigService {
  return { get: jest.fn().mockReturnValue(apiKey) } as unknown as ConfigService;
}

const FIELDS = ['subcategoryCode', 'currentMaturity', 'rationale'] as const;

describe('AiMappingService', () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it('returns null without calling the API when no ANTHROPIC_API_KEY is configured', async () => {
    const service = new AiMappingService(configWithKey(undefined));
    const result = await service.suggestMapping(['Code'], [], FIELDS);
    expect(result).toBeNull();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('returns null when there are no headers to map', async () => {
    const service = new AiMappingService(configWithKey('sk-ant-test'));
    const result = await service.suggestMapping([], [], FIELDS);
    expect(result).toBeNull();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('returns a mapping restricted to real headers and real target fields', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          name: 'suggest_mapping',
          input: {
            mapping: {
              subcategoryCode: 'Code',
              currentMaturity: 'Current Level',
              rationale: null,
            },
          },
        },
      ],
    });

    const service = new AiMappingService(configWithKey('sk-ant-test'));
    const result = await service.suggestMapping(['Code', 'Current Level'], [{ Code: 'GV.RM-01' }], FIELDS);

    expect(result).toEqual({ subcategoryCode: 'Code', currentMaturity: 'Current Level' });
  });

  it('drops a suggested header that does not actually exist in the sheet (hallucination guard)', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          name: 'suggest_mapping',
          input: {
            mapping: { subcategoryCode: 'Code', currentMaturity: 'A Column That Does Not Exist' },
          },
        },
      ],
    });

    const service = new AiMappingService(configWithKey('sk-ant-test'));
    const result = await service.suggestMapping(['Code'], [], FIELDS);

    expect(result).toEqual({ subcategoryCode: 'Code' });
  });

  it('drops a suggested mapping entry for a field that was never asked for', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          name: 'suggest_mapping',
          input: { mapping: { subcategoryCode: 'Code', notARealField: 'Code' } },
        },
      ],
    });

    const service = new AiMappingService(configWithKey('sk-ant-test'));
    const result = await service.suggestMapping(['Code'], [], FIELDS);

    expect(result).toEqual({ subcategoryCode: 'Code' });
  });

  it('returns null (never throws) when the API call fails', async () => {
    mockCreate.mockRejectedValueOnce(new Error('network error'));
    const service = new AiMappingService(configWithKey('sk-ant-test'));
    const result = await service.suggestMapping(['Code'], [], FIELDS);
    expect(result).toBeNull();
  });

  it('returns null when the response contains no tool_use block', async () => {
    mockCreate.mockResolvedValueOnce({ content: [{ type: 'text', text: 'no mapping for you' }] });
    const service = new AiMappingService(configWithKey('sk-ant-test'));
    const result = await service.suggestMapping(['Code'], [], FIELDS);
    expect(result).toBeNull();
  });
});
