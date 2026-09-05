import { render, screen, within } from '@testing-library/react';

import type { RiskRecord } from '../../../lib/api';
import RisksPage from '../../../pages/risks/index';

// This page also exports getServerSideProps, which imports lib/auth -> next-auth/next ->
// next-auth/core -> openid-client -> jose (ESM-only) at module load time — none of which this
// test needs, since it renders the default-exported component directly with mock props. Mocked
// out rather than widening Jest's transformIgnorePatterns for the whole project just to parse a
// dependency chain no component test actually exercises. (jest.mock calls are hoisted above
// imports by babel-jest regardless of where they're written, so this runs before RisksPage's own
// import of lib/auth above.)
//
// This test file also deliberately lives outside apps/web/pages/ (in a mirrored __tests__/pages/
// tree instead) rather than colocated with the page it tests: Next.js's pages-router treats any
// .tsx file under pages/ as a real route by filename alone, so a `pages/risks/index.test.tsx`
// file previously broke `next build` outright (webpack tried to compile it as the page at
// /risks/index.test, and choked on the Jest-only `jest.mock` global at build time). Component
// tests don't have this problem — only pages/ is special to Next's router — so those stay
// colocated as normal.
jest.mock('../../../lib/auth', () => ({ getAuthSession: jest.fn() }));

// RisksPage now renders the shared AppHeader, which reads the active route via next/router's
// useRouter() to highlight the current nav item — real only inside a Next app, not a bare RTL
// render, so it needs the same kind of mock as lib/auth above.
jest.mock('next/router', () => ({ useRouter: () => ({ pathname: '/risks' }) }));

const risk: RiskRecord = {
  id: 'risk-1',
  organisationId: 'org-1',
  title: 'Unpatched EOL server',
  description: null,
  threat: null,
  vulnerability: null,
  likelihood: 4,
  impact: 5,
  inherentRiskScore: 20,
  residualRiskScore: null,
  riskLevel: 'CRITICAL',
  owner: null,
  treatment: 'MONITOR',
  targetDate: null,
  status: 'OPEN',
};

describe('RisksPage', () => {
  it('renders each risk with its title, score, and status', () => {
    render(<RisksPage risks={[risk]} canCreate={false} sort="priority" status="" errorMessage={null} />);
    expect(screen.getByText('Unpatched EOL server')).toBeInTheDocument();
    expect(screen.getByText(/Likelihood 4 × Impact 5 = 20/)).toBeInTheDocument();
    // "OPEN" also appears in the status-filter links above the list, so this scopes to the risk
    // row's own status badge specifically rather than asserting text presence anywhere on the page.
    const row = screen.getByText('Unpatched EOL server').closest('a') as HTMLElement;
    expect(within(row).getByText('OPEN')).toBeInTheDocument();
    expect(within(row).getByText('CRITICAL')).toBeInTheDocument();
  });

  it('shows the empty-filter message when no risks match, not a blank page', () => {
    render(<RisksPage risks={[]} canCreate={false} sort="priority" status="CLOSED" errorMessage={null} />);
    expect(screen.getByText(/no risks match this filter/i)).toBeInTheDocument();
  });

  it('only shows "New Risk" to a role that can actually write one', () => {
    const { rerender } = render(<RisksPage risks={[]} canCreate={false} sort="priority" status="" errorMessage={null} />);
    expect(screen.queryByText('New Risk')).not.toBeInTheDocument();

    rerender(<RisksPage risks={[]} canCreate={true} sort="priority" status="" errorMessage={null} />);
    expect(screen.getByText('New Risk')).toBeInTheDocument();
  });

  it('surfaces a load error instead of silently showing an empty list', () => {
    render(<RisksPage risks={[]} canCreate={false} sort="priority" status="" errorMessage="Failed to load risks." />);
    expect(screen.getByText('Failed to load risks.')).toBeInTheDocument();
  });
});
