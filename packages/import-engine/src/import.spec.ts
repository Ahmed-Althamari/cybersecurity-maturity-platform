import { buildErrorReportCsv } from './error-report';
import { importFromCsv } from './import';

describe('importFromCsv', () => {
  it('parses a well-formed CSV using canonical column names end to end', () => {
    const csv = ['Control_ID,Current_Maturity,Target_Maturity,Weight,Risk,Status', 'GV.RM-01,DEVELOPING,MANAGED,1,HIGH,IN_PROGRESS'].join(
      '\n',
    );

    const result = importFromCsv(csv);

    expect(result.totalRows).toBe(1);
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0].data.controlId).toBe('GV.RM-01');
    expect(result.invalid).toHaveLength(0);
  });

  it('auto-maps alternate headers, per master prompt example ("Current Score" -> Current_Maturity)', () => {
    const csv = ['Control ID,Current Score,Target Score', 'GV.RM-01,3,4'].join('\n');

    const result = importFromCsv(csv);

    expect(result.columnMapping.Control_ID).toBe('Control ID');
    expect(result.columnMapping.Current_Maturity).toBe('Current Score');
    expect(result.valid[0].data.currentMaturity).toBe('DEFINED');
  });

  it('never silently discards a bad row — it lands in `invalid` with a reason', () => {
    const csv = ['Control_ID,Current_Maturity', ',bogus'].join('\n');

    const result = importFromCsv(csv);

    expect(result.totalRows).toBe(1);
    expect(result.valid).toHaveLength(0);
    expect(result.invalid).toHaveLength(1);
    expect(result.invalid[0].issues.length).toBeGreaterThanOrEqual(2);
  });

  it('separates valid, warning, invalid, and duplicate rows into their own buckets', () => {
    const csv = [
      'Control_ID,Current_Maturity,Due_Date',
      'GV.RM-01,DEVELOPING,2026-01-01', // valid
      'GV.RM-02,DEVELOPING,not-a-date', // warning (bad due date)
      ',DEVELOPING,', // invalid (no Control_ID)
      'GV.RM-01,MANAGED,', // duplicate of row 2
    ].join('\n');

    const result = importFromCsv(csv);

    expect(result.valid).toHaveLength(1);
    expect(result.warnings).toHaveLength(1);
    expect(result.invalid).toHaveLength(1);
    expect(result.duplicates).toHaveLength(1);
  });

  it('neutralises a formula-injection cell rather than storing it verbatim', () => {
    const csv = ['Control_ID,Comments', 'GV.RM-01,"=cmd|\'/c calc\'!A1"'].join('\n');

    const result = importFromCsv(csv);

    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].data.comments?.startsWith("'=")).toBe(true);
  });

  it('lists canonical columns that could not be mapped from the file headers', () => {
    const csv = ['Control_ID', 'GV.RM-01'].join('\n');
    const result = importFromCsv(csv);
    expect(result.unmappedColumns).toEqual(expect.arrayContaining(['Owner', 'Comments', 'Due_Date']));
  });
});

describe('buildErrorReportCsv', () => {
  it('includes every non-valid row with its issues, and excludes valid rows', () => {
    const csv = ['Control_ID,Current_Maturity', 'GV.RM-01,DEVELOPING', ',bogus'].join('\n');
    const result = importFromCsv(csv);

    const report = buildErrorReportCsv(result);

    expect(report).toContain('Row,Status,Control_ID,Issues');
    expect(report).toContain('invalid');
    expect(report.split('\n')).toHaveLength(2); // header + the one invalid row
  });
});
