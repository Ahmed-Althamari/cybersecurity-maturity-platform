import ExcelJS from 'exceljs';

import { MAX_ROWS } from './file-guard';
import type { RawSheet } from './types';

/**
 * Converts one exceljs cell value to plain text. For a formula cell, we
 * only ever read its computed `.result` — never `.formula` — so an
 * imported cell can't smuggle formula text into stored data (it's already
 * been evaluated by whatever produced the file; we're not re-evaluating
 * anything here).
 */
function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    if ('richText' in value) return value.richText.map((part) => part.text).join('');
    if ('text' in value) return String(value.text ?? '');
    if ('formula' in value) return cellToString(value.result ?? '');
    if ('error' in value) return value.error;
  }
  return String(value);
}

export interface ParsedWorkbook {
  sheetNames: string[];
  sheet: RawSheet;
}

/** Parses one worksheet of an .xlsx/.xls workbook (the first one, unless `worksheetName` is given) into a header row + data rows. */
export async function parseXlsx(buffer: Buffer, worksheetName?: string): Promise<ParsedWorkbook> {
  const workbook = new ExcelJS.Workbook();
  // exceljs@4.4.0 ships its own ambient `Buffer extends ArrayBuffer` shim
  // instead of depending on @types/node, which no longer structurally
  // matches modern @types/node's generic `Buffer extends Uint8Array<T>`.
  // The mismatch is purely in the merged type declarations — a real
  // Node Buffer satisfies both at runtime — so this cast is safe.
  await workbook.xlsx.load(buffer as never);

  const sheetNames = workbook.worksheets.map((ws) => ws.name);
  const worksheet = worksheetName ? workbook.getWorksheet(worksheetName) : workbook.worksheets[0];
  if (!worksheet) {
    throw new Error(worksheetName ? `Worksheet '${worksheetName}' not found` : 'Workbook has no worksheets');
  }

  let headers: string[] = [];
  const rows: string[][] = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber > MAX_ROWS + 1) return; // +1 for the header row itself

    const values = (row.values as ExcelJS.CellValue[]).slice(1).map(cellToString);
    if (rowNumber === 1) {
      headers = values;
    } else {
      rows.push(values);
    }
  });

  return { sheetNames, sheet: { headers, rows } };
}
