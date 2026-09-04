import type { MappedRow } from './map-row';
import { validateRow } from './validate-row';

function row(raw: MappedRow['raw'], rowNumber = 2): MappedRow {
  return { rowNumber, raw, sanitizationIssues: [] };
}

describe('validateRow', () => {
  it('marks a fully valid row as valid', () => {
    const result = validateRow(
      row({
        Control_ID: 'GV.RM-01',
        Current_Maturity: 'DEVELOPING',
        Target_Maturity: 'MANAGED',
        Weight: '1.5',
        Risk: 'HIGH',
        Business_Criticality: '4',
        Status: 'IN_PROGRESS',
      }),
    );

    expect(result.status).toBe('valid');
    expect(result.issues).toEqual([]);
    expect(result.data).toMatchObject({
      controlId: 'GV.RM-01',
      currentMaturity: 'DEVELOPING',
      targetMaturity: 'MANAGED',
      weight: 1.5,
      riskLevel: 'HIGH',
      businessCriticality: 4,
      controlStatus: 'IN_PROGRESS',
    });
  });

  it('requires Control_ID', () => {
    const result = validateRow(row({ Current_Maturity: 'DEVELOPING' }));
    expect(result.status).toBe('invalid');
    expect(result.issues).toEqual([expect.objectContaining({ column: 'Control_ID', severity: 'error' })]);
  });

  it('accepts a numeric maturity score and converts it to the nearest level', () => {
    const result = validateRow(row({ Control_ID: 'GV.RM-01', Current_Maturity: '4' }));
    expect(result.data.currentMaturity).toBe('MANAGED');
  });

  it('rejects an unrecognised maturity value', () => {
    const result = validateRow(row({ Control_ID: 'GV.RM-01', Current_Maturity: 'super good' }));
    expect(result.status).toBe('invalid');
    expect(result.issues).toEqual([expect.objectContaining({ column: 'Current_Maturity', severity: 'error' })]);
  });

  it('accepts common status synonyms', () => {
    expect(validateRow(row({ Control_ID: 'a', Status: 'Not Started' })).data.controlStatus).toBe('NOT_STARTED');
    expect(validateRow(row({ Control_ID: 'a', Status: 'In Progress' })).data.controlStatus).toBe('IN_PROGRESS');
    expect(validateRow(row({ Control_ID: 'a', Status: 'Complete' })).data.controlStatus).toBe('COMPLETED');
  });

  it('defaults weight to 1 when blank, but rejects a negative weight', () => {
    expect(validateRow(row({ Control_ID: 'a' })).data.weight).toBe(1);

    const negative = validateRow(row({ Control_ID: 'a', Weight: '-1' }));
    expect(negative.status).toBe('invalid');
    expect(negative.issues).toEqual([expect.objectContaining({ column: 'Weight' })]);
  });

  it('rejects business criticality outside 1-5', () => {
    const result = validateRow(row({ Control_ID: 'a', Business_Criticality: '9' }));
    expect(result.status).toBe('invalid');
    expect(result.issues).toEqual([expect.objectContaining({ column: 'Business_Criticality' })]);
  });

  it('treats an unparseable due date as a warning, not a hard failure', () => {
    const result = validateRow(row({ Control_ID: 'a', Due_Date: 'not a date' }));
    expect(result.status).toBe('warning');
    expect(result.issues).toEqual([expect.objectContaining({ column: 'Due_Date', severity: 'warning' })]);
  });

  it('carries a sanitized-cell warning from mapRow through to the row status', () => {
    const result = validateRow({
      rowNumber: 2,
      raw: { Control_ID: 'a', Comments: "'=cmd|'/c calc'!A1" },
      sanitizationIssues: [{ column: 'Comments', message: 'sanitized', severity: 'warning' }],
    });
    expect(result.status).toBe('warning');
  });

  it('collects every issue in one pass rather than stopping at the first', () => {
    const result = validateRow(
      row({ Current_Maturity: 'nonsense', Business_Criticality: '99' }), // also missing Control_ID
    );
    expect(result.status).toBe('invalid');
    expect(result.issues.length).toBeGreaterThanOrEqual(3);
  });
});
