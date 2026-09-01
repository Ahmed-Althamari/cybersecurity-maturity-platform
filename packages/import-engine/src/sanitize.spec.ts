import { sanitizeFormulaInjection } from './sanitize';

describe('sanitizeFormulaInjection', () => {
  it.each(['=SUM(A1:A9)', '+1+1', '-2+3', '@SUM(1,2)', '\tmalicious', '\rmalicious'])(
    'neutralizes a value starting with a formula-trigger character: %s',
    (value) => {
      const result = sanitizeFormulaInjection(value);
      expect(result.sanitized).toBe(true);
      expect(result.value).toBe(`'${value}`);
      expect(result.value[0]).toBe("'");
    },
  );

  it('leaves ordinary text untouched', () => {
    const result = sanitizeFormulaInjection('Access controls are documented and enforced');
    expect(result.sanitized).toBe(false);
    expect(result.value).toBe('Access controls are documented and enforced');
  });

  it('does not flag a formula-trigger character that is not in the leading position', () => {
    const result = sanitizeFormulaInjection('Risk score = 4 (medium)');
    expect(result.sanitized).toBe(false);
  });

  it('handles an empty string without throwing', () => {
    expect(sanitizeFormulaInjection('')).toEqual({ value: '', sanitized: false });
  });
});
