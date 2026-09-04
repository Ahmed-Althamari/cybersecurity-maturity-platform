// Framework-agnostic assessment engine.
//
// Loads a framework definition (from JSON or from database records mapped
// into this shape), validates it, and exposes generic helpers so the rest
// of the platform (assessment engine, dashboards, navigation) never has to
// branch on which framework it's dealing with.

export { FrameworkValidationError, type FrameworkValidationIssue } from './errors';
export { flattenFramework } from './flatten';
export { loadFrameworkFromJson, parseFrameworkDefinition } from './loader';
export { buildFrameworkNavigation } from './navigation';
export {
  categoryDefinitionSchema,
  frameworkDefinitionSchema,
  functionDefinitionSchema,
  questionDefinitionSchema,
  subcategoryDefinitionSchema,
} from './schema';
export type {
  CategoryDefinition,
  FlattenedFramework,
  FrameworkDefinition,
  FunctionDefinition,
  NavigationNode,
  QuestionDefinition,
  SubcategoryDefinition,
} from './types';
