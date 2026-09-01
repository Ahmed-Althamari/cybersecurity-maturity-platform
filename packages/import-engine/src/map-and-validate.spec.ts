import { mapAndValidateRows } from './map-and-validate';
import type { ColumnMapping, ParsedRow } from './types';

const mapping: ColumnMapping = {
  subcategoryCode: 'Subcategory',
  currentMaturity: 'Current',
  targetMaturity: 'Target',
  riskLevel: 'Risk',
  controlStatus: 'Status',
  businessCriticality: 'Criticality',
  rationale: 'Rationale',
  evidence: 'Evidence',
  ownerName: 'Owner',
  ownerEmail: 'Owner Email',
  remediationDueDate: 'Due Date',
};

function row(cells: Record<string, unknown>, rowNumber = 2): ParsedRow {
  return { rowNumber, cells };
}

describe('mapAndValidateRows', () => {
  it('maps a fully valid row', () => {
    const [result] = mapAndValidateRows(
      [
        row({
          Subcategory: 'GV.RM-01',
          Current: 'Defined',
          Target: 'Managed',
          Risk: 'medium',
          Status: 'in progress',
          Criticality: '4',
          Rationale: 'Documented in policy v3',
          'Owner Email': 'ciso@example.local',
        }),
      ],
      mapping,
    );

    expect(result.status).toBe('VALID');
    expect(result.data).toEqual(
      expect.objectContaining({
        subcategoryCode: 'GV.RM-01',
        currentMaturity: 'DEFINED',
        targetMaturity: 'MANAGED',
        riskLevel: 'MEDIUM',
        controlStatus: 'IN_PROGRESS',
        businessCriticality: 4,
        rationale: 'Documented in policy v3',
        ownerEmail: 'ciso@example.local',
      }),
    );
  });

  it('errors when subcategoryCode is missing', () => {
    const [result] = mapAndValidateRows([row({ Current: 'DEFINED' })], mapping);
    expect(result.status).toBe('ERROR');
    expect(result.messages[0]).toMatch(/subcategoryCode/);
    expect(result.data).toBeUndefined();
  });

  it('rejects an unrecognized enum value with the valid options listed', () => {
    const [result] = mapAndValidateRows(
      [row({ Subcategory: 'GV.RM-01', Current: 'super-duper-mature' })],
      mapping,
    );
    expect(result.status).toBe('ERROR');
    expect(result.messages[0]).toContain('super-duper-mature');
    expect(result.messages[0]).toContain('OPTIMISED');
  });

  it('rejects businessCriticality outside 1-5', () => {
    const [tooHigh] = mapAndValidateRows([row({ Subcategory: 'x', Criticality: '9' })], mapping);
    const [notANumber] = mapAndValidateRows([row({ Subcategory: 'x', Criticality: 'high' })], mapping);
    expect(tooHigh.status).toBe('ERROR');
    expect(notANumber.status).toBe('ERROR');
  });

  it('rejects a malformed owner email', () => {
    const [result] = mapAndValidateRows(
      [row({ Subcategory: 'x', 'Owner Email': 'not-an-email' })],
      mapping,
    );
    expect(result.status).toBe('ERROR');
  });

  it('rejects an unparseable due date', () => {
    const [result] = mapAndValidateRows(
      [row({ Subcategory: 'x', 'Due Date': 'sometime next quarter maybe' })],
      mapping,
    );
    expect(result.status).toBe('ERROR');
  });

  it('sanitizes a formula-injection attempt in a free-text field as a WARNING, not an ERROR', () => {
    const [result] = mapAndValidateRows(
      [row({ Subcategory: 'GV.RM-01', Rationale: '=HYPERLINK("http://evil.example","click")' })],
      mapping,
    );

    expect(result.status).toBe('WARNING');
    expect(result.data?.rationale).toBe("'=HYPERLINK(\"http://evil.example\",\"click\")");
    expect(result.messages[0]).toMatch(/neutralized/);
  });

  it('leaves optional fields undefined when their source column is blank', () => {
    const [result] = mapAndValidateRows([row({ Subcategory: 'GV.RM-01' })], mapping);
    expect(result.status).toBe('VALID');
    expect(result.data).toEqual({
      subcategoryCode: 'GV.RM-01',
      currentMaturity: undefined,
      targetMaturity: undefined,
      riskLevel: undefined,
      controlStatus: undefined,
      businessCriticality: undefined,
      rationale: undefined,
      evidence: undefined,
      assessorComments: undefined,
      ownerName: undefined,
      ownerEmail: undefined,
      remediationDueDate: undefined,
    });
  });

  it('preserves the row number and raw cells on every result for the audit trail', () => {
    const raw = { Subcategory: 'GV.RM-01' };
    const [result] = mapAndValidateRows([row(raw, 7)], mapping);
    expect(result.rowNumber).toBe(7);
    expect(result.raw).toBe(raw);
  });
});
