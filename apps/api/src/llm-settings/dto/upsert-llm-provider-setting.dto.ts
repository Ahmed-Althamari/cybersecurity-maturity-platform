import { IsIn, IsOptional, IsString, IsUrl, MinLength } from 'class-validator';

const FORMATS = ['openai', 'anthropic'];

export class UpsertLlmProviderSettingDto {
  @IsIn(FORMATS)
  format!: 'openai' | 'anthropic';

  // Required for 'openai' (any OpenAI-compatible /chat/completions endpoint); optional for
  // 'anthropic', where the SDK defaults to api.anthropic.com — enforced in LlmSettingsService.
  @IsOptional()
  @IsUrl({ require_tld: false })
  baseUrl?: string;

  @IsString()
  @MinLength(1)
  model!: string;

  @IsString()
  @MinLength(10)
  apiKey!: string;
}

export class TestLlmProviderSettingDto {
  @IsOptional()
  @IsIn(FORMATS)
  format?: 'openai' | 'anthropic';

  @IsOptional()
  @IsUrl({ require_tld: false })
  baseUrl?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  apiKey?: string;
}
