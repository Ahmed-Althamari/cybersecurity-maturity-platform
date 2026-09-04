import { autoMapColumns } from './columns';

describe('autoMapColumns', () => {
  it('matches exact canonical column names', () => {
    const mapping = autoMapColumns(['Control_ID', 'Current_Maturity', 'Target_Maturity']);
    expect(mapping.Control_ID).toBe('Control_ID');
    expect(mapping.Current_Maturity).toBe('Current_Maturity');
  });

  it('matches known aliases case- and spacing-insensitively, per master prompt example ("Current Score" -> Current_Maturity)', () => {
    const mapping = autoMapColumns(['Control ID', 'Current Score', 'target score']);
    expect(mapping.Control_ID).toBe('Control ID');
    expect(mapping.Current_Maturity).toBe('Current Score');
    expect(mapping.Target_Maturity).toBe('target score');
  });

  it('leaves unmatched canonical columns absent from the mapping', () => {
    const mapping = autoMapColumns(['Control_ID']);
    expect(mapping.Owner).toBeUndefined();
    expect(mapping.Comments).toBeUndefined();
  });
});
