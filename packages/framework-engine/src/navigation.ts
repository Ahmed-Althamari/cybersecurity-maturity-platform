import type { CategoryDefinition, FrameworkDefinition, FunctionDefinition, NavigationNode, SubcategoryDefinition } from './types';

interface TreeLike {
  code: string;
  name: string;
  description?: string;
  displayOrder?: number;
}

function byDisplayOrder<T extends TreeLike>(a: T, b: T): number {
  return (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || a.code.localeCompare(b.code);
}

function toNode(item: TreeLike, parentPath: string, depth: number, children: NavigationNode[]): NavigationNode {
  const path = parentPath ? `${parentPath}/${item.code}` : item.code;
  return {
    id: path,
    code: item.code,
    label: item.name,
    description: item.description,
    path,
    depth,
    children,
  };
}

function buildSubcategoryNode(subcategory: SubcategoryDefinition, parentPath: string, depth: number): NavigationNode {
  return toNode(subcategory, parentPath, depth, []);
}

function buildCategoryNode(category: CategoryDefinition, parentPath: string, depth: number): NavigationNode {
  const node = toNode(category, parentPath, depth, []);
  node.children = [...category.subcategories]
    .sort(byDisplayOrder)
    .map((subcategory) => buildSubcategoryNode(subcategory, node.path, depth + 1));
  return node;
}

function buildFunctionNode(fn: FunctionDefinition, parentPath: string, depth: number): NavigationNode {
  const node = toNode(fn, parentPath, depth, []);
  node.children = [...fn.categories].sort(byDisplayOrder).map((category) => buildCategoryNode(category, node.path, depth + 1));
  return node;
}

/**
 * Builds a navigation/assessment tree straight from a framework's
 * function -> category -> subcategory hierarchy. Works the same way for
 * any framework (NIST CSF, ISO 27001, CIS, or a custom one) because it
 * only ever walks the generic shape, never a framework-specific field or
 * level count.
 */
export function buildFrameworkNavigation(framework: FrameworkDefinition): NavigationNode[] {
  return [...framework.functions].sort(byDisplayOrder).map((fn) => buildFunctionNode(fn, framework.slug, 0));
}
