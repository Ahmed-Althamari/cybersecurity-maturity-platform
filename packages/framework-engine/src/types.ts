// Framework-agnostic definition types.
//
// These describe a *loadable* framework (the shape the engine accepts from
// JSON or from a database read) as opposed to `@cmmp/shared`'s flat,
// persistence-oriented `Framework`/`Function`/`Category`/`Subcategory`
// interfaces. Here, children are nested so the whole hierarchy can be
// validated and walked as one tree.

export interface QuestionDefinition {
  question: string;
  guidance?: string;
  examples?: string[];
  referenceLinks?: string[];
}

export interface SubcategoryDefinition {
  code: string;
  name: string;
  description?: string;
  displayOrder?: number;
  questions?: QuestionDefinition[];
}

export interface CategoryDefinition {
  code: string;
  name: string;
  description?: string;
  displayOrder?: number;
  subcategories: SubcategoryDefinition[];
}

export interface FunctionDefinition {
  code: string;
  name: string;
  description?: string;
  displayOrder?: number;
  categories: CategoryDefinition[];
}

export interface FrameworkDefinition {
  slug: string;
  name: string;
  version: string;
  frameworkType: string;
  description?: string;
  isActive?: boolean;
  functions: FunctionDefinition[];
}

// ============================================================================
// NAVIGATION
// ============================================================================

/**
 * A generic, depth-agnostic tree node. The UI walks this to render
 * navigation/assessments/dashboards for *any* framework without ever
 * branching on framework type or level (function/category/subcategory).
 */
export interface NavigationNode {
  id: string;
  code: string;
  label: string;
  description?: string;
  path: string;
  depth: number;
  children: NavigationNode[];
}

// ============================================================================
// FLATTENED LOOKUPS
// ============================================================================

export interface FlattenedFramework {
  functionsByCode: Map<string, FunctionDefinition>;
  categoriesByCode: Map<string, CategoryDefinition>;
  subcategoriesByCode: Map<string, SubcategoryDefinition>;
}
