import { fireEvent, render, screen } from '@testing-library/react';

import type { NavigationNode } from '../../lib/api';

import { NavigationTree } from './NavigationTree';

const subcategory: NavigationNode = {
  id: 'nist/gv/gv.oc/gv.oc-01',
  code: 'GV.OC-01',
  label: 'The organizational mission is understood',
  description: 'The organizational mission is understood',
  path: 'nist/gv/gv.oc/gv.oc-01',
  depth: 2,
  children: [],
};

const category: NavigationNode = {
  id: 'nist/gv/gv.oc',
  code: 'GV.OC',
  label: 'Organizational Context',
  path: 'nist/gv/gv.oc',
  depth: 1,
  children: [subcategory],
};

const fn: NavigationNode = {
  id: 'nist/gv',
  code: 'GV',
  label: 'Govern',
  path: 'nist/gv',
  depth: 0,
  children: [category],
};

describe('NavigationTree', () => {
  it('shows a fallback message when the framework has no functions', () => {
    render(<NavigationTree nodes={[]} />);
    expect(screen.getByText(/no functions defined/i)).toBeInTheDocument();
  });

  it('renders every node in the tree with its code and label', () => {
    render(<NavigationTree nodes={[fn]} />);
    expect(screen.getByText('Govern')).toBeInTheDocument();
    expect(screen.getByText('Organizational Context')).toBeInTheDocument();
  });

  it('shows a child count on branch nodes', () => {
    render(<NavigationTree nodes={[fn]} />);
    // Both the function (1 category) and the category (1 subcategory) show "(1)".
    expect(screen.getAllByText('(1)')).toHaveLength(2);
  });

  it('does not repeat a leaf node\'s description when it is identical to its label', () => {
    render(<NavigationTree nodes={[fn]} />);
    fireEvent.click(screen.getByText('Organizational Context'));
    // The subcategory's label text appears once; its identical description isn't rendered again.
    expect(screen.getAllByText('The organizational mission is understood')).toHaveLength(1);
  });

  it('expands a collapsed category on click, leaving the already-open function alone', () => {
    render(<NavigationTree nodes={[fn]} />);

    // jsdom doesn't implement <details>'s native "hide children unless open" rendering (there's
    // no real layout engine to apply it), so this asserts on the actual `open` IDL property each
    // click toggles, rather than DOM presence/visibility of the children — both would report
    // "visible" in jsdom regardless of the `open` attribute.
    const categoryDetails = screen.getByText('Organizational Context').closest('details') as HTMLDetailsElement;
    const functionDetails = screen.getByText('Govern').closest('details') as HTMLDetailsElement;
    expect(categoryDetails.open).toBe(false);
    expect(functionDetails.open).toBe(true);

    fireEvent.click(screen.getByText('Organizational Context'));

    expect(categoryDetails.open).toBe(true);
    expect(functionDetails.open).toBe(true);
  });
});
