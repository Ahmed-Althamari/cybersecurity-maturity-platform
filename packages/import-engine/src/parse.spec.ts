import ExcelJS from 'exceljs';
import { parseSpreadsheet, SpreadsheetParseError } from './parse';

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
