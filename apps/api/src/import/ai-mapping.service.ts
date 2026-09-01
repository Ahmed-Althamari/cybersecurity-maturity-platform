import Anthropic from '@anthropic-ai/sdk';
import type { ColumnMapping } from '@cmmp/import-engine';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const MODEL = 'claude-opus-5';
const MAX_SAMPLE_ROWS = 5;

const SUGGEST_MAPPING_TOOL_NAME = 'suggest_mapping';

/**
 * Enhances (never replaces) the frontend's exact-header-name auto-mapping:
 * given a sheet's real headers and a few real sample rows, asks Claude
 * which header supplies each target field -- covering spreadsheets whose
 * columns don't happen to match our field names exactly (e.g. a customer's
 * "Current Level"/"Owner (email)" instead of currentMaturity/ownerEmail).
 *
 * Deliberately fails soft everywhere: no API key configured, a network
 * error, a malformed tool response, or a suggested header that doesn't
 * actually exist in the sheet all result in that field being left
 * unmapped (for a human to map by hand) rather than the import flow
 * breaking or a hallucinated column silently feeding real data into the
 * wrong field.
 */
@Injectable()
export class AiMappingService {
  private readonly logger = new Logger('AiMappingService');
  private readonly client: Anthropic | null;

  constructor(config: ConfigService) {
    const apiKey = config.get<string>('ANTHROPIC_API_KEY');
    this.client = apiKey ? new Anthropic({ apiKey }) : null;
  }

  /**
   * @param targetFields every field the caller is willing to accept a
   *   mapping for (e.g. `['subcategoryCode', 'currentMaturity', ...]`).
   * @returns a mapping restricted to real headers and real target fields,
   *   or `null` if suggestion isn't possible/available right now (no key,
   *   no headers, or the call failed) -- callers should fall back to their
   *   own exact-match auto-mapping (or an empty mapping) in that case.
   */
  async suggestMapping(
    headers: string[],
    sampleRows: Record<string, unknown>[],
    targetFields: readonly string[],
  ): Promise<ColumnMapping | null> {
    if (!this.client || headers.length === 0 || targetFields.length === 0) {
      return null;
    }

    try {
      const response = await this.client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        output_config: { effort: 'low' },
        tools: [buildMappingTool(targetFields)],
        tool_choice: { type: 'tool', name: SUGGEST_MAPPING_TOOL_NAME },
        messages: [{ role: 'user', content: buildPrompt(headers, sampleRows, targetFields) }],
      });

      const toolUse = response.content.find(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
      );
      if (!toolUse) {
        return null;
      }

      return sanitizeSuggestion(toolUse.input, headers, targetFields);
    } catch (error) {
      // Never lets an AI-suggestion failure block or slow down the import
      // flow it's only ever meant to assist -- see the class doc.
      this.logger.warn(
        `AI column-mapping suggestion failed, falling back to exact-match mapping: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }
}

function buildMappingTool(targetFields: readonly string[]): Anthropic.Tool {
  const fieldProperties: Record<string, { type: string[] }> = {};
  for (const field of targetFields) {
    fieldProperties[field] = { type: ['string', 'null'] };
  }

  return {
    name: SUGGEST_MAPPING_TOOL_NAME,
    description:
      "Suggest which source spreadsheet column header supplies each target field, or null if none of the sheet's columns correspond to that field.",
    input_schema: {
      type: 'object',
      properties: {
        mapping: {
          type: 'object',
          description: 'target field name -> the exact source header text that supplies it, or null',
          properties: fieldProperties,
          required: [...targetFields],
          additionalProperties: false,
        },
      },
      required: ['mapping'],
      additionalProperties: false,
    },
    strict: true,
  };
}

function buildPrompt(
  headers: string[],
  sampleRows: Record<string, unknown>[],
  targetFields: readonly string[],
): string {
  const sample = sampleRows.slice(0, MAX_SAMPLE_ROWS);
  return [
    'A user is importing a cybersecurity assessment spreadsheet. Map each',
    'target field below to the source column header that supplies it.',
    '',
    `Source column headers: ${JSON.stringify(headers)}`,
    '',
    `Sample rows: ${JSON.stringify(sample)}`,
    '',
    `Target fields: ${JSON.stringify(targetFields)}`,
    '',
    'Use your judgment on near-miss names (e.g. "Current Level" likely maps',
    'to currentMaturity, "Owner Email"/"Assigned To (email)" likely maps to',
    'ownerEmail). Only map a field when a real column header is genuinely a',
    'plausible match -- use null rather than guessing when nothing fits.',
  ].join('\n');
}

/**
 * Restricts a suggested mapping to headers that actually exist and fields
 * that were actually asked for -- the one thing this function must never
 * trust the model's output for, since a hallucinated header would
 * otherwise flow straight into ColumnMapping and silently pull the wrong
 * (or no) data into a field.
 */
function sanitizeSuggestion(
  rawInput: unknown,
  headers: string[],
  targetFields: readonly string[],
): ColumnMapping {
  const headerSet = new Set(headers);
  const targetFieldSet = new Set(targetFields);
  const mapping: ColumnMapping = {};

  const rawMapping =
    rawInput && typeof rawInput === 'object' && 'mapping' in rawInput
      ? (rawInput as { mapping: unknown }).mapping
      : undefined;
  if (!rawMapping || typeof rawMapping !== 'object') {
    return mapping;
  }

  for (const [field, header] of Object.entries(rawMapping as Record<string, unknown>)) {
    if (
      targetFieldSet.has(field) &&
      typeof header === 'string' &&
      headerSet.has(header)
    ) {
      (mapping as Record<string, string>)[field] = header;
    }
  }

  return mapping;
}
