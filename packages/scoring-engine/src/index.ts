// Maturity scoring calculation engine.
//
// Turns scored assessment responses into item/category/function/framework
// rollups, gap analysis, and trend — as reusable, tested functions, kept
// out of React components and out of the Assessment Engine's write path
// per master prompt §33.

export { combineScores, scoreItems } from './aggregate';
export { scoreFramework } from './framework-score';
export { analyzeGaps, type AnalyzeGapsOptions } from './gaps';
export { maturityLevelToScore, scoreToMaturityLevel } from './levels';
export { computeTrend } from './trend';
export type { FrameworkScore, GapEntry, MaturityScore, ScoredItem, ScoredNode, Trend, TrendPoint } from './types';
