import { MaturityLevel } from '@cmmp/shared';

import { maturityLevelToScore, scoreToMaturityLevel } from './levels';

describe('maturityLevelToScore', () => {
  it('maps every level to its numeric score', () => {
    expect(maturityLevelToScore(MaturityLevel.NOT_APPLICABLE)).toBe(0);
    expect(maturityLevelToScore(MaturityLevel.INITIAL)).toBe(1);
    expect(maturityLevelToScore(MaturityLevel.DEVELOPING)).toBe(2);
    expect(maturityLevelToScore(MaturityLevel.DEFINED)).toBe(3);
    expect(maturityLevelToScore(MaturityLevel.MANAGED)).toBe(4);
    expect(maturityLevelToScore(MaturityLevel.OPTIMISED)).toBe(5);
  });
});

describe('scoreToMaturityLevel', () => {
  it('rounds to the nearest level', () => {
    expect(scoreToMaturityLevel(2.4)).toBe(MaturityLevel.DEVELOPING);
    expect(scoreToMaturityLevel(2.6)).toBe(MaturityLevel.DEFINED);
  });

  it('clamps out-of-range scores', () => {
    expect(scoreToMaturityLevel(-3)).toBe(MaturityLevel.NOT_APPLICABLE);
    expect(scoreToMaturityLevel(9)).toBe(MaturityLevel.OPTIMISED);
  });

  it('round-trips every level through maturityLevelToScore', () => {
    for (const level of Object.values(MaturityLevel)) {
      expect(scoreToMaturityLevel(maturityLevelToScore(level))).toBe(level);
    }
  });
});
