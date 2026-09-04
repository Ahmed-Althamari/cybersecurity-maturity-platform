import { markDuplicates } from './duplicates';
import type { ValidatedRow } from './types';

function validRow(rowNumber: number, controlId?: string): ValidatedRow {
  return { rowNumber, status: 'valid', issues: [], data: { controlId }, raw: {} };
}

describe('markDuplicates', () => {
  it('leaves the first occurrence of a Control_ID untouched', () => {
    const [first] = markDuplicates([validRow(2, 'GV.RM-01')]);
    expect(first.status).toBe('valid');
  });

  it('flags every later row sharing a Control_ID as duplicate, referencing the first row', () => {
    const [first, second, third] = markDuplicates([validRow(2, 'GV.RM-01'), validRow(5, 'GV.RM-01'), validRow(9, 'GV.RM-01')]);

    expect(first.status).toBe('valid');
    expect(second.status).toBe('duplicate');
    expect(second.issues[0].message).toContain('row 2');
    expect(third.status).toBe('duplicate');
    expect(third.issues[0].message).toContain('row 2');
  });

  it('does not treat rows with no Control_ID as duplicates of each other', () => {
    const rows = markDuplicates([validRow(2, undefined), validRow(3, undefined)]);
    expect(rows.every((row) => row.status === 'valid')).toBe(true);
  });

  it('leaves an already-invalid row invalid rather than masking it as merely duplicate', () => {
    const invalid: ValidatedRow = { rowNumber: 5, status: 'invalid', issues: [], data: { controlId: 'GV.RM-01' }, raw: {} };
    const [, second] = markDuplicates([validRow(2, 'GV.RM-01'), invalid]);

    expect(second.status).toBe('invalid');
    expect(second.issues).toEqual([expect.objectContaining({ message: expect.stringContaining('row 2') })]);
  });
});
