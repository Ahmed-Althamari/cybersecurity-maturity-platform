import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import type { ParsedRow, SheetRows, SpreadsheetFormat } from './types';

export class SpreadsheetParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SpreadsheetParseError';
  }
}

/**
 * Parses every tab in the workbook (xlsx) -- or the single implicit "sheet"
 * a CSV represents -- in one pass. This is the primitive both the
 * multi-sheet preview (one upload, every tab's headers/sample rows back at
 * once) and {@link parseSpreadsheet} (which just picks one sheet back out
 * of this) are built on, so a workbook is only ever parsed once per request.
 */
export async function parseAllSheets(buffer: Buffer, format: SpreadsheetFormat): Promise<SheetRows[]> {
  return format === 'csv' ? [{ sheetName: 'Sheet1', rows: parseCsv(buffer) }] : parseXlsxAllSheets(buffer);
}

/**
 * Parses one sheet's rows. `sheetName` selects an xlsx tab by name (case-
 * sensitive, matching Excel's own tab names); omitted or not found falls
 * back to the first sheet in the workbook -- the same behavior this
 * function had before multi-sheet support existed, so every pre-existing
 * caller/test that never passed a sheet name is unaffected. Meaningless for
 * CSV, which has no concept of tabs.
 */
export async function parseSpreadsheet(
  buffer: Buffer,
  format: SpreadsheetFormat,
  sheetName?: string,
): Promise<ParsedRow[]> {
  const sheets = await parseAllSheets(buffer, format);
  const selected = (sheetName && sheets.find((sheet) => sheet.sheetName === sheetName)) || sheets[0];
  return selected ? selected.rows : [];
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

async function parseXlsxAllSheets(buffer: Buffer): Promise<SheetRows[]> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch (error) {
    throw new SpreadsheetParseError(
      `Failed to parse XLSX: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (workbook.worksheets.length === 0) {
    throw new SpreadsheetParseError('Workbook has no worksheets');
  }

  return workbook.worksheets.map((worksheet) => ({
    sheetName: worksheet.name,
    rows: parseWorksheet(worksheet),
  }));
}

function parseWorksheet(worksheet: ExcelJS.Worksheet): ParsedRow[] {
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
    let formulas: Record<string, string> | undefined;
    headers.forEach((header, index) => {
      if (!header) {
        return;
      }
      const rawValue = row.getCell(index + 1).value;
      cells[header] = cellToValue(rawValue);
      const formulaText = cellFormulaText(rawValue);
      if (formulaText !== null) {
        formulas ??= {};
        formulas[header] = formulaText;
      }
    });
    rows.push(formulas ? { rowNumber, cells, formulas } : { rowNumber, cells });
  });

  return rows;
}

/**
 * The formula text behind a cell, e.g. "=SUM(A1:A3)" -- kept separate from
 * {@link cellToValue}'s resolved *result*, so a caller (the import preview)
 * can show a human both "what was calculated" and "how", without ever
 * treating the formula string itself as importable data (see the
 * formula-injection note on cellToValue below).
 */
function cellFormulaText(raw: ExcelJS.CellValue): string | null {
  if (raw !== null && typeof raw === 'object' && 'formula' in raw) {
    return `=${(raw as ExcelJS.CellFormulaValue).formula}`;
  }
  return null;
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
