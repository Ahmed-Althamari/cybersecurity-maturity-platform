import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import type { ParsedRow, SpreadsheetFormat } from './types';

export class SpreadsheetParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SpreadsheetParseError';
  }
}

export async function parseSpreadsheet(
  buffer: Buffer,
  format: SpreadsheetFormat,
): Promise<ParsedRow[]> {
  return format === 'csv' ? parseCsv(buffer) : parseXlsx(buffer);
}

function parseCsv(buffer: Buffer): ParsedRow[] {
  const result = Papa.parse<Record<string, string>>(buffer.toString('utf-8'), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  });

  const fatalError = result.errors.find((error) => error.row === undefined);
  if (fatalError) {
    throw new SpreadsheetParseError(`Failed to parse CSV: ${fatalError.message}`);
  }

  return result.data.map((cells, index) => ({
    // +2: 1-based, plus the header row itself, so this matches the row
    // number a user would see if they opened the file.
    rowNumber: index + 2,
    cells,
  }));
}

async function parseXlsx(buffer: Buffer): Promise<ParsedRow[]> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch (error) {
    throw new SpreadsheetParseError(
      `Failed to parse XLSX: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new SpreadsheetParseError('Workbook has no worksheets');
  }

  const headerRow = worksheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber - 1] = String(cellToValue(cell.value) ?? '').trim();
  });

  const rows: ParsedRow[] = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) {
      return; // header row, already consumed
    }
    const cells: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      if (!header) {
        return;
      }
      cells[header] = cellToValue(row.getCell(index + 1).value);
    });
    rows.push({ rowNumber, cells });
  });

  return rows;
}

function cellToValue(raw: ExcelJS.CellValue): unknown {
  if (raw === null || raw === undefined) {
    return null;
  }
  if (typeof raw === 'object') {
    if (raw instanceof Date) {
      return raw;
    }
    // A formula cell: use its last calculated result, not the formula text
    // itself — the formula string is exactly the kind of content
    // sanitizeFormulaInjection() exists to neutralize, and re-evaluating
    // untrusted formulas is not something this importer does.
    if ('result' in raw) {
      return cellToValue((raw as ExcelJS.CellFormulaValue).result as ExcelJS.CellValue);
    }
    // Rich text: flatten to plain text.
    if ('richText' in raw) {
      return (raw as ExcelJS.CellRichTextValue).richText.map((fragment) => fragment.text).join('');
    }
    if ('text' in raw) {
      return (raw as ExcelJS.CellHyperlinkValue).text;
    }
  }
  return raw;
}
