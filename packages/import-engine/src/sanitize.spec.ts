import { isFormulaInjection, sanitizeCellValue } from './sanitize';

describe('isFormulaInjection', () => {
  it.each([
    '=cmd|"/c calc"!A1',
    '+cmd|"/c calc"!A1',
    '-cmd|"/c calc"!A1',
    '@SUM(1+1)',
    '\ttabbed',
    '\rcarriage',
  ])('flags %s as an injection attempt', (value) => {
    expect(isFormulaInjection(value)).toBe(true);
  });

  it.each(['DEVELOPING', 'Some comment', '3', '-1', '-4.5', '+5', ''])('does not flag plain data %s', (value) => {
    expect(isFormulaInjection(value)).toBe(false);
  });
});

describe('sanitizeCellValue', () => {
  it('prefixes a formula-looking value with a single quote', () => {
    expect(sanitizeCellValue('=HYPERLINK("http://evil")')).toEqual({
      value: "'=HYPERLINK(\"http://evil\")",
      wasSanitized: true,
    });
  });

  it('leaves plain data untouched', () => {
    expect(sanitizeCellValue('DEVELOPING')).toEqual({ value: 'DEVELOPING', wasSanitized: false });
  });

  it('does not flag a plain negative number', () => {
    expect(sanitizeCellValue('-2.5')).toEqual({ value: '-2.5', wasSanitized: false });
  });
});
