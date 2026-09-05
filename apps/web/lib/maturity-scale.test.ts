import { maturityBand, riskLevelColor, STATUS_COLORS } from './maturity-scale';

describe('maturityBand', () => {
  it('buckets scores into the four status bands at the documented thresholds', () => {
    expect(maturityBand(0)).toEqual({ label: 'Critical', color: STATUS_COLORS.critical });
    expect(maturityBand(1.49)).toEqual({ label: 'Critical', color: STATUS_COLORS.critical });
    expect(maturityBand(1.5)).toEqual({ label: 'Serious', color: STATUS_COLORS.serious });
    expect(maturityBand(2.49)).toEqual({ label: 'Serious', color: STATUS_COLORS.serious });
    expect(maturityBand(2.5)).toEqual({ label: 'Warning', color: STATUS_COLORS.warning });
    expect(maturityBand(3.49)).toEqual({ label: 'Warning', color: STATUS_COLORS.warning });
    expect(maturityBand(3.5)).toEqual({ label: 'Good', color: STATUS_COLORS.good });
    expect(maturityBand(5)).toEqual({ label: 'Good', color: STATUS_COLORS.good });
  });
});

describe('riskLevelColor', () => {
  it('returns a distinct color per known risk level', () => {
    const levels = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'MINIMAL'];
    const colors = levels.map(riskLevelColor);
    expect(new Set(colors).size).toBe(levels.length);
  });

  it('falls back to the MINIMAL color for an unrecognised risk level rather than throwing', () => {
    expect(riskLevelColor('SOMETHING_UNEXPECTED')).toBe(riskLevelColor('MINIMAL'));
  });
});
