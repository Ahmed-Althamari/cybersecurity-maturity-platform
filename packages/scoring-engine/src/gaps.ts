import type { GapEntry, ScoredNode } from './types';

export interface AnalyzeGapsOptions {
  /** Restrict results to nodes at this depth (0 = function, 1 = category, 2 = subcategory). Omit for every level. */
  depth?: number;
  /** Drop nodes below this gap (default: only positive gaps — a node already at or past target isn't a gap). */
  minGap?: number;
  /** Cap the number of results returned, after sorting. */
  limit?: number;
}

function flatten(nodes: ScoredNode[]): GapEntry[] {
  const entries: GapEntry[] = [];
  for (const node of nodes) {
    entries.push({ code: node.code, label: node.label, depth: node.depth, current: node.score.current, target: node.score.target, gap: node.score.gap });
    entries.push(...flatten(node.children));
  }
  return entries;
}

/**
 * Flattens a scored tree into a prioritised list of gaps (largest first).
 * Nodes with no applicable items score 0/0/0 and are dropped by the
 * default `minGap` of just-above-zero, since "no data yet" isn't a
 * measured gap.
 */
export function analyzeGaps(nodes: ScoredNode[], options: AnalyzeGapsOptions = {}): GapEntry[] {
  const { depth, minGap = 0.01, limit } = options;

  let entries = flatten(nodes);
  if (depth !== undefined) {
    entries = entries.filter((entry) => entry.depth === depth);
  }
  entries = entries.filter((entry) => entry.gap >= minGap);
  entries.sort((a, b) => b.gap - a.gap || a.code.localeCompare(b.code));

  return limit !== undefined ? entries.slice(0, limit) : entries;
}
