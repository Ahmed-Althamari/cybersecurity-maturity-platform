import ExcelJS from 'exceljs';

import { parseXlsx } from './parse-xlsx';

async function buildWorkbook(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet1 = workbook.addWorksheet('Assessment');
  sheet1.addRow(['Control_ID', 'Current_Maturity', 'Due_Date', 'Formula_Cell']);
  sheet1.addRow(['GV.RM-01', 'DEVELOPING', new Date('2026-01-01T00:00:00.000Z'), { formula: 'SUM(1,2)', result: 3 }]);

  const sheet2 = workbook.addWorksheet('Other');
  sheet2.addRow(['Unrelated']);

  return (await workbook.xlsx.writeBuffer()) as unknown as Buffer;
}

describe('parseXlsx', () => {
  it('parses the first worksheet by default and lists every sheet name', async () => {
    const buffer = await buildWorkbook();
    const { sheetNames, sheet } = await parseXlsx(buffer);

    expect(sheetNames).toEqual(['Assessment', 'Other']);
    expect(sheet.headers).toEqual(['Control_ID', 'Current_Maturity', 'Due_Date', 'Formula_Cell']);
    expect(sheet.rows).toHaveLength(1);
    expect(sheet.rows[0][0]).toBe('GV.RM-01');
  });

  it('reads a formula cell by its computed result, never its formula text', async () => {
    const buffer = await buildWorkbook();
    const { sheet } = await parseXlsx(buffer);

    expect(sheet.rows[0][3]).toBe('3');
  });

  it('can select a worksheet by name', async () => {
    const buffer = await buildWorkbook();
    const { sheet } = await parseXlsx(buffer, 'Other');

    expect(sheet.headers).toEqual(['Unrelated']);
  });

  it('throws for a worksheet name that does not exist', async () => {
    const buffer = await buildWorkbook();
    await expect(parseXlsx(buffer, 'Nonexistent')).rejects.toThrow("Worksheet 'Nonexistent' not found");
  });
});
