import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import type { PaginatedInitiatives, RiskRecord } from '../../../lib/api';

// See apps/web/__tests__/pages/risks/index.test.tsx for why this lives outside pages/ and why
// next/router needs mocking (AppHeader reads the active route via useRouter()) and lib/auth does
// too (getServerSideProps -> lib/auth -> next-auth/next -> next-auth/core -> openid-client -> jose
// is ESM-only and not needed here — this test renders the default-exported component directly).
jest.mock('next/router', () => ({ useRouter: () => ({ pathname: '/risks/risk-1', asPath: '/risks/risk-1', push: jest.fn(), replace: jest.fn() }) }));
jest.mock('../../../lib/auth', () => ({ getAuthSession: jest.fn() }));

jest.mock('../../../lib/api', () => ({
  ...jest.requireActual('../../../lib/api'),
  listInitiatives: jest.fn(),
  linkInitiative: jest.fn(),
  unlinkInitiative: jest.fn(),
  updateRisk: jest.fn(),
  deleteRisk: jest.fn(),
}));

import { linkInitiative, listInitiatives, unlinkInitiative } from '../../../lib/api';
import RiskDetailPage from '../../../pages/risks/[id]';

const mockListInitiatives = listInitiatives as jest.Mock;
const mockLinkInitiative = linkInitiative as jest.Mock;
const mockUnlinkInitiative = unlinkInitiative as jest.Mock;

function baseRisk(overrides: Partial<RiskRecord> = {}): RiskRecord {
  return {
    id: 'risk-1',
    organisationId: 'org-1',
    title: 'Unpatched public-facing servers',
    description: null,
    threat: null,
    vulnerability: null,
    likelihood: 3,
    impact: 4,
    inherentRiskScore: 12,
    residualRiskScore: 8,
    riskLevel: 'HIGH',
    owner: null,
    treatment: 'MITIGATE',
    targetDate: null,
    status: 'OPEN',
    initiatives: [],
    ...overrides,
  };
}

function initiativePage(page: number, totalPages: number): PaginatedInitiatives {
  return {
    data: [{ id: `initiative-${page}`, title: `Initiative on page ${page}`, status: 'PLANNED' }],
    total: totalPages * 10,
    page,
    pageSize: 10,
    totalPages,
  };
}

describe('RiskDetailPage initiative picker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const props = { accessToken: 'token-123', canEdit: true, canDelete: false, errorMessage: null };

  it('loads the first page of initiatives on mount with no search term', async () => {
    mockListInitiatives.mockResolvedValue(initiativePage(1, 1));

    render(<RiskDetailPage risk={baseRisk()} {...props} />);

    await waitFor(() => expect(screen.getByText('Initiative on page 1 (PLANNED)')).toBeInTheDocument());
    expect(mockListInitiatives).toHaveBeenCalledWith('token-123', 'org-1', { search: '', page: 1, pageSize: 10 });
  });

  it('debounces search input and resets to page 1', async () => {
    jest.useFakeTimers();
    mockListInitiatives.mockResolvedValue(initiativePage(1, 1));

    render(<RiskDetailPage risk={baseRisk()} {...props} />);
    await waitFor(() => expect(screen.getByText('Initiative on page 1 (PLANNED)')).toBeInTheDocument());

    mockListInitiatives.mockClear();
    mockListInitiatives.mockResolvedValue(initiativePage(1, 1));
    fireEvent.change(screen.getByPlaceholderText('Search initiatives by title…'), { target: { value: 'firewall' } });

    // Before the debounce fires, no new call yet.
    expect(mockListInitiatives).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(300);
    });
    jest.useRealTimers();

    await waitFor(() =>
      expect(mockListInitiatives).toHaveBeenCalledWith('token-123', 'org-1', { search: 'firewall', page: 1, pageSize: 10 }),
    );
  });

  it('advances to the next page and requests it from the API', async () => {
    mockListInitiatives.mockResolvedValueOnce(initiativePage(1, 2));

    render(<RiskDetailPage risk={baseRisk()} {...props} />);
    await waitFor(() => expect(screen.getByText('Initiative on page 1 (PLANNED)')).toBeInTheDocument());
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();

    mockListInitiatives.mockResolvedValueOnce(initiativePage(2, 2));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => expect(screen.getByText('Initiative on page 2 (PLANNED)')).toBeInTheDocument());
    expect(mockListInitiatives).toHaveBeenLastCalledWith('token-123', 'org-1', { search: '', page: 2, pageSize: 10 });
  });

  it('lets the user select an initiative from the list, then link it', async () => {
    mockListInitiatives.mockResolvedValue(initiativePage(1, 1));
    mockLinkInitiative.mockResolvedValue(undefined);

    render(<RiskDetailPage risk={baseRisk()} {...props} />);
    await waitFor(() => expect(screen.getByText('Initiative on page 1 (PLANNED)')).toBeInTheDocument());

    const linkButton = screen.getByRole('button', { name: 'Link' });
    expect(linkButton).toBeDisabled();

    fireEvent.click(screen.getByText('Initiative on page 1 (PLANNED)'));
    expect(linkButton).toBeEnabled();

    fireEvent.click(linkButton);

    await waitFor(() => expect(mockLinkInitiative).toHaveBeenCalledWith('token-123', 'initiative-1', 'risk-1'));
    // Optimistically moves into the linked list without a full page reload.
    await waitFor(() => expect(screen.getAllByText('Initiative on page 1').length).toBeGreaterThan(0));
  });

  it('unlinks an already-linked initiative', async () => {
    mockListInitiatives.mockResolvedValue(initiativePage(2, 2));
    mockUnlinkInitiative.mockResolvedValue(undefined);

    const linked = { id: 'initiative-linked', title: 'Roll out MFA', status: 'IN_PROGRESS' };
    render(<RiskDetailPage risk={baseRisk({ initiatives: [linked] })} {...props} />);

    expect(screen.getByText('Roll out MFA')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Unlink' }));

    await waitFor(() => expect(mockUnlinkInitiative).toHaveBeenCalledWith('token-123', 'initiative-linked', 'risk-1'));
    await waitFor(() => expect(screen.queryByText('Roll out MFA')).not.toBeInTheDocument());
  });

  it('does not offer link/unlink controls to a read-only viewer', async () => {
    mockListInitiatives.mockResolvedValue(initiativePage(1, 1));
    const linked = { id: 'initiative-linked', title: 'Roll out MFA', status: 'IN_PROGRESS' };

    render(<RiskDetailPage risk={baseRisk({ initiatives: [linked] })} {...props} canEdit={false} />);

    await waitFor(() => expect(screen.getByText('Roll out MFA')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Unlink' })).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Search initiatives by title…')).not.toBeInTheDocument();
  });
});
