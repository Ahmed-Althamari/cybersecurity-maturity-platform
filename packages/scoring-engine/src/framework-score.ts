import type { CategoryDefinition, FrameworkDefinition, FunctionDefinition, SubcategoryDefinition } from '@cmmp/framework-engine';

import { scoreItems } from './aggregate';
import type { FrameworkScore, ScoredItem, ScoredNode } from './types';

function collectSubcategoryCodes(category: CategoryDefinition): string[] {
  return category.subcategories.map((sub) => sub.code);
}

function scoreSubcategory(subcategory: SubcategoryDefinition, itemsByCode: Map<string, ScoredItem[]>, depth: number): ScoredNode {
  const items = itemsByCode.get(subcategory.code) ?? [];
  return {
    code: subcategory.code,
    label: subcategory.name,
    depth,
    score: scoreItems(items),
    children: [],
  };
}

function scoreCategory(category: CategoryDefinition, itemsByCode: Map<string, ScoredItem[]>, depth: number): ScoredNode {
  const children = category.subcategories.map((sub) => scoreSubcategory(sub, itemsByCode, depth + 1));
  const codes = collectSubcategoryCodes(category);
  const items = codes.flatMap((code) => itemsByCode.get(code) ?? []);
  return {
    code: category.code,
    label: category.name,
    depth,
    score: scoreItems(items),
    children,
  };
}

function scoreFunctionNode(fn: FunctionDefinition, itemsByCode: Map<string, ScoredItem[]>, depth: number): ScoredNode {
  const children = fn.categories.map((category) => scoreCategory(category, itemsByCode, depth + 1));
  const codes = fn.categories.flatMap((category) => collectSubcategoryCodes(category));
  const items = codes.flatMap((code) => itemsByCode.get(code) ?? []);
  return {
    code: fn.code,
    label: fn.name,
    depth,
    score: scoreItems(items),
    children,
  };
}

/**
 * Scores every level of a framework's function → category → subcategory
 * tree from a flat list of responses, plus the framework-wide overall
 * score. Each node's score is a direct weighted average of the items
 * beneath it (not an average of its children's averages), so aggregation
 * stays correct regardless of how unevenly populated the tree is.
 */
export function scoreFramework(framework: FrameworkDefinition, items: ScoredItem[]): FrameworkScore {
  const itemsByCode = new Map<string, ScoredItem[]>();
  for (const item of items) {
    const existing = itemsByCode.get(item.subcategoryCode);
    if (existing) {
      existing.push(item);
    } else {
      itemsByCode.set(item.subcategoryCode, [item]);
    }
  }

  const functions = framework.functions.map((fn) => scoreFunctionNode(fn, itemsByCode, 0));

  return {
    overall: scoreItems(items),
    functions,
  };
}
