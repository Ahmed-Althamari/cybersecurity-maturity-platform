import { MaturityLevel } from '@cmmp/shared';
import { maturityLevelToScore, scoreToMaturityLevel } from './maturity-scale';

describe('maturityLevelToScore', () => {
  it('maps each assessable level to its 1-5 score', () => {
    expect(maturityLevelToScore(MaturityLevel.INITIAL)).toBe(1);
    expect(maturityLevelToScore(MaturityLevel.DEVELOPING)).toBe(2);
    expect(maturityLevelToScore(MaturityLevel.DEFINED)).toBe(3);
    expect(maturityLevelToScore(MaturityLevel.MANAGED)).toBe(4);
    expect(maturityLevelToScore(MaturityLevel.OPTIMISED)).toBe(5);
  });

  it('returns null for NOT_APPLICABLE (excluded from scoring, not a zero)', () => {
    expect(maturityLevelToScore(MaturityLevel.NOT_APPLICABLE)).toBeNull();
  });
});

describe('scoreToMaturityLevel', () => {
  it('round-trips exact scores back to their level', () => {
    expect(scoreToMaturityLevel(1)).toBe(MaturityLevel.INITIAL);
    expect(scoreToMaturityLevel(3)).toBe(MaturityLevel.DEFINED);
    expect(scoreToMaturityLevel(5)).toBe(MaturityLevel.OPTIMISED);
  });

  it('rounds a fractional score to the nearest level', () => {
    expect(scoreToMaturityLevel(2.6)).toBe(MaturityLevel.DEFINED);
    expect(scoreToMaturityLevel(2.4)).toBe(MaturityLevel.DEVELOPING);
  });

  it('clamps out-of-range scores instead of returning an invalid level', () => {
    expect(scoreToMaturityLevel(0)).toBe(MaturityLevel.INITIAL);
    expect(scoreToMaturityLevel(7)).toBe(MaturityLevel.OPTIMISED);
  });

  it('passes null through', () => {
    expect(scoreToMaturityLevel(null)).toBeNull();
  });
});
