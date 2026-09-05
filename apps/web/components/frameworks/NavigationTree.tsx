import React from 'react';

import type { NavigationNode } from '../../lib/api';

/** depth 0 = function, 1 = category, 2 = subcategory (leaf, no children) — generic on purpose, matches buildFrameworkNavigation's own framework-agnostic depth. */
function NavigationTreeNode({ node }: { node: NavigationNode }) {
  const hasChildren = node.children.length > 0;

  if (!hasChildren) {
    // Seed data derives a subcategory's assessment-question text from its own outcome statement,
    // so `description` is often word-for-word the same as `label` — showing both would just
    // repeat the same sentence twice.
    const showDescription = node.description && node.description !== node.label;
    return (
      <li className="py-2 pl-4 border-l border-slate-700">
        <p className="text-slate-200 text-sm font-medium">
          <span className="text-slate-500 font-mono text-xs mr-2">{node.code}</span>
          {node.label}
        </p>
        {showDescription && <p className="text-slate-500 text-xs mt-0.5">{node.description}</p>}
      </li>
    );
  }

  return (
    <li className="py-1">
      <details className="group" open={node.depth === 0}>
        <summary className="cursor-pointer list-none flex items-center gap-2 py-1 text-slate-100 hover:text-white">
          <span className="text-slate-500 transition-transform group-open:rotate-90 inline-block">▶</span>
          <span className="text-slate-500 font-mono text-xs">{node.code}</span>
          <span className={node.depth === 0 ? 'font-semibold' : 'font-medium'}>{node.label}</span>
          <span className="text-slate-500 text-xs">({node.children.length})</span>
        </summary>
        <ul className="ml-5 mt-1">
          {node.children.map((child) => (
            <NavigationTreeNode key={child.id} node={child} />
          ))}
        </ul>
      </details>
    </li>
  );
}

export function NavigationTree({ nodes }: { nodes: NavigationNode[] }) {
  if (nodes.length === 0) {
    return <p className="text-slate-400 text-sm">This framework has no functions defined.</p>;
  }

  return (
    <ul className="space-y-1">
      {nodes.map((node) => (
        <NavigationTreeNode key={node.id} node={node} />
      ))}
    </ul>
  );
}
