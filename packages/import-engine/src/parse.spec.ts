import ExcelJS from 'exceljs';
import { parseAllSheets, parseSpreadsheet, SpreadsheetParseError } from './parse';

describe('parseSpreadsheet (csv)', () => {
  it('parses headers and rows, 1-indexed to match a user-visible row number', async () => {
    const csv = 'subcategoryCode,currentMaturity\nGV.RM-01,DEFINED\nGV.RM-02,MANAGED\n';
    const rows = await parseSpreadsheet(Buffer.from(csv, 'utf-8'), 'csv');

    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ rowNumber: 2, cells: { subcategoryCode: 'GV.RM-01', currentMaturity: 'DEFINED' } });
    expect(rows[1].rowNumber).toBe(3);
  });

  it('trims header whitespace and skips empty lines', async () => {
    const csv = ' subcategoryCode , rationale \nGV.RM-01,ok\n\n';
    const rows = await parseSpreadsheet(Buffer.from(csv, 'utf-8'), 'csv');
    expect(Object.keys(rows[0].cells)).toEqual(['subcategoryCode', 'rationale']);
  });

  it('parseAllSheets treats a CSV as a single implicit sheet', async () => {
    const csv = 'subcategoryCode,currentMaturity\nGV.RM-01,DEFINED\n';
    const sheets = await parseAllSheets(Buffer.from(csv, 'utf-8'), 'csv');
    expect(sheets).toEqual([
      { sheetName: 'Sheet1', rows: [{ rowNumber: 2, cells: { subcategoryCode: 'GV.RM-01', currentMaturity: 'DEFINED' } }] },
    ]);
  });
});

describe('parseSpreadsheet (xlsx)', () => {
  async function buildWorkbookBuffer(build: (sheet: ExcelJS.Worksheet) => void): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Sheet1');
    build(sheet);
    return (await workbook.xlsx.writeBuffer()) as unknown as Buffer;
  }

  it('parses headers and rows from the first worksheet', async () => {
    const buffer = await buildWorkbookBuffer((sheet) => {
      sheet.addRow(['subcategoryCode', 'currentMaturity']);
      sheet.addRow(['GV.RM-01', 'DEFINED']);
    });

    const rows = await parseSpreadsheet(buffer, 'xlsx');

    expect(rows).toHaveLength(1);
    expect(rows[0].cells).toEqual({ subcategoryCode: 'GV.RM-01', currentMaturity: 'DEFINED' });
    expect(rows[0].rowNumber).toBe(2);
  });

  it('resolves a formula cell to its last calculated result, not the formula text', async () => {
    const buffer = await buildWorkbookBuffer((sheet) => {
      sheet.addRow(['subcategoryCode', 'businessCriticality']);
      const row = sheet.addRow(['GV.RM-01', null]);
      row.getCell(2).value = { formula: '2+3', result: 5 } as ExcelJS.CellFormulaValue;
    });

    const rows = await parseSpreadsheet(buffer, 'xlsx');
    expect(rows[0].cells.businessCriticality).toBe(5);
  });

  it('also surfaces the formula text alongside the resolved result', async () => {
    const buffer = await buildWorkbookBuffer((sheet) => {
      sheet.addRow(['subcategoryCode', 'businessCriticality']);
      const row = sheet.addRow(['GV.RM-01', null]);
      row.getCell(2).value = { formula: '2+3', result: 5 } as ExcelJS.CellFormulaValue;
    });

    const rows = await parseSpreadsheet(buffer, 'xlsx');
    expect(rows[0].formulas).toEqual({ businessCriticality: '=2+3' });
  });

  it('omits `formulas` entirely for a row with no formula cells', async () => {
    const buffer = await buildWorkbookBuffer((sheet) => {
      sheet.addRow(['subcategoryCode', 'currentMaturity']);
      sheet.addRow(['GV.RM-01', 'DEFINED']);
    });

    const rows = await parseSpreadsheet(buffer, 'xlsx');
    expect(rows[0].formulas).toBeUndefined();
  });

  it('flattens rich text cells to plain text', async () => {
    const buffer = await buildWorkbookBuffer((sheet) => {
      sheet.addRow(['subcategoryCode', 'rationale']);
      const row = sheet.addRow(['GV.RM-01', null]);
      row.getCell(2).value = {
        richText: [{ text: 'Partially ' }, { text: 'implemented' }],
      } as ExcelJS.CellRichTextValue;
    });

    const rows = await parseSpreadsheet(buffer, 'xlsx');
    expect(rows[0].cells.rationale).toBe('Partially implemented');
  });

  it('throws SpreadsheetParseError for a corrupt file instead of an opaque exceljs error', async () => {
    await expect(parseSpreadsheet(Buffer.from('not a real xlsx file'), 'xlsx')).rejects.toThrow(
      SpreadsheetParseError,
    );
  });
});

describe('multi-sheet workbooks', () => {
  async function buildMultiSheetBuffer(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const govern = workbook.addWorksheet('Govern');
    govern.addRow(['subcategoryCode', 'currentMaturity']);
    govern.addRow(['GV.RM-01', 'DEFINED']);

    const identify = workbook.addWorksheet('Identify');
    identify.addRow(['subcategoryCode', 'currentMaturity']);
    identify.addRow(['ID.AM-01', 'MANAGED']);
    identify.addRow(['ID.AM-02', 'INITIAL']);

    return (await workbook.xlsx.writeBuffer()) as unknown as Buffer;
  }

  it('parseAllSheets returns every tab, each keyed by its real Excel sheet name', async () => {
    const buffer = await buildMultiSheetBuffer();
    const sheets = await parseAllSheets(buffer, 'xlsx');

    expect(sheets.map((s) => s.sheetName)).toEqual(['Govern', 'Identify']);
    expect(sheets[0].rows).toHaveLength(1);
    expect(sheets[1].rows).toHaveLength(2);
    expect(sheets[1].rows[0].cells).toEqual({ subcategoryCode: 'ID.AM-01', currentMaturity: 'MANAGED' });
  });

  it('parseSpreadsheet selects the named sheet', async () => {
    const buffer = await buildMultiSheetBuffer();
    const rows = await parseSpreadsheet(buffer, 'xlsx', 'Identify');
    expect(rows).toHaveLength(2);
    expect(rows[0].cells.subcategoryCode).toBe('ID.AM-01');
  });

  it('parseSpreadsheet falls back to the first sheet when no name is given', async () => {
    const buffer = await buildMultiSheetBuffer();
    const rows = await parseSpreadsheet(buffer, 'xlsx');
    expect(rows).toHaveLength(1);
    expect(rows[0].cells.subcategoryCode).toBe('GV.RM-01');
  });

  it('parseSpreadsheet falls back to the first sheet when the named sheet does not exist', async () => {
    const buffer = await buildMultiSheetBuffer();
    const rows = await parseSpreadsheet(buffer, 'xlsx', 'NoSuchTab');
    expect(rows).toHaveLength(1);
    expect(rows[0].cells.subcategoryCode).toBe('GV.RM-01');
  });
});
