import type { FrameworkTree } from './types';

// A small, fixed palette cycled by display order so the frontend can render
// framework navigation, radar charts, and heatmaps generically — six slots
// happen to match NIST CSF 2.0's function count, but the cycle means any
// framework with more or fewer top-level functions (ISO 27001's clauses,
// CIS Controls' groups, ...) still gets a stable, non-repeating-until-wrap
// color assignment without frontend code branching on which framework it is.
const FUNCTION_COLOR_PALETTE = [
  '#2563EB', // blue
  '#059669', // green
  '#D97706', // amber
  '#DC2626', // red
  '#7C3AED', // violet
  '#0891B2', // cyan
] as const;

export interface FunctionComponentDescriptor {
  id: string;
  code: string;
  name: string;
  displayOrder: number;
  color: string;
  categoryCount: number;
  subcategoryCount: number;
  questionCount: number;
}

export interface FrameworkComponentDescriptor {
  frameworkId: string;
  name: string;
  slug: string;
  version: string;
  functions: FunctionComponentDescriptor[];
  totals: {
    functionCount: number;
    categoryCount: number;
    subcategoryCount: number;
    questionCount: number;
  };
}

/**
 * Reduces a hydrated `FrameworkTree` into a compact, generic descriptor the
 * frontend can walk to dynamically render framework-specific UI (nav trees,
 * radar charts, maturity heatmaps) without hard-coding NIST CSF's six
 * functions or any other framework's shape. This is the "dynamic component
 * generation" piece of the Phase 4 framework engine — the actual React
 * components are built in Phase 10, but the data contract they consume is
 * framework-agnostic from here on.
 */
export function buildFrameworkComponentDescriptor(
  tree: FrameworkTree,
): FrameworkComponentDescriptor {
  let categoryCount = 0;
  let subcategoryCount = 0;
  let questionCount = 0;

  const functions: FunctionComponentDescriptor[] = tree.functions.map((fn, index) => {
    const fnSubcategoryCount = fn.categories.reduce(
      (sum, category) => sum + category.subcategories.length,
      0,
    );
    const fnQuestionCount = fn.categories.reduce(
      (sum, category) =>
        sum + category.subcategories.reduce((s, sub) => s + sub.questions.length, 0),
      0,
    );

    categoryCount += fn.categories.length;
    subcategoryCount += fnSubcategoryCount;
    questionCount += fnQuestionCount;

    return {
      id: fn.id,
      code: fn.code,
      name: fn.name,
      displayOrder: fn.displayOrder,
      color: FUNCTION_COLOR_PALETTE[index % FUNCTION_COLOR_PALETTE.length],
      categoryCount: fn.categories.length,
      subcategoryCount: fnSubcategoryCount,
      questionCount: fnQuestionCount,
    };
  });

  return {
    frameworkId: tree.id,
    name: tree.name,
    slug: tree.slug,
    version: tree.version,
    functions,
    totals: {
      functionCount: functions.length,
      categoryCount,
      subcategoryCount,
      questionCount,
    },
  };
}
