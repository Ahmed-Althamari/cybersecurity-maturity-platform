import type { CategoryDefinition, FlattenedFramework, FrameworkDefinition, FunctionDefinition, SubcategoryDefinition } from './types';

/**
 * Indexes every function/category/subcategory in a framework by its code
 * for O(1) lookup. Downstream engines (assessment, scoring) build on this
 * instead of re-walking the tree, and it stays framework-agnostic since it
 * only relies on the generic hierarchy shape.
 */
export function flattenFramework(framework: FrameworkDefinition): FlattenedFramework {
  const functionsByCode = new Map<string, FunctionDefinition>();
  const categoriesByCode = new Map<string, CategoryDefinition>();
  const subcategoriesByCode = new Map<string, SubcategoryDefinition>();

  for (const fn of framework.functions) {
    functionsByCode.set(fn.code, fn);
    for (const category of fn.categories) {
      categoriesByCode.set(category.code, category);
      for (const subcategory of category.subcategories) {
        subcategoriesByCode.set(subcategory.code, subcategory);
      }
    }
  }

  return { functionsByCode, categoriesByCode, subcategoriesByCode };
}
