import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';

import { api } from '@/lib/api';
import RiskDetailPage from '@/pages/risks/[id]';

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
  signOut: jest.fn(),
}));
jest.mock('next/router', () => ({ useRouter: jest.fn() }));
jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  api: {
    getRisk: jest.fn(),
    listInitiatives: jest.fn(),
    linkInitiative: jest.fn(),
    unlinkInitiative: jest.fn(),
    updateRisk: jest.fn(),
  },
}));

const mockUseSession = useSession as jest.Mock;
const mockUseRouter = useRouter as jest.Mock;
const mockGetRisk = api.getRisk as jest.Mock;
const mockListInitiatives = api.listInitiatives as jest.Mock;

function baseRisk() {
  return {
    id: 'risk-1',
    organisationId: 'org-1',
    title: 'Unpatched public-facing servers',
    description: null,
    threat: null,
    vulnerability: null,
    assessmentItemId: null,
    assessmentItem: null,
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
    createdAt: new Date('2026-01-01T00:00:00Z').toISOString(),
  };
}

function initiativePage(page: number, totalPages: number) {
  return {
    data: [
      {
        id: `initiative-${page}`,
        organisationId: 'org-1',
        title: `Initiative on page ${page}`,
        description: null,
        securityCapability: null,
        priority: 1,
        complexity: 1,
        currentMaturity: 'INITIAL',
        targetMaturity: 'MANAGED',
        estimatedCost: null,
        startDate: null,
        targetCompletionDate: null,
        status: 'PLANNED',
        owner: null,
        risks: [],
        createdAt: new Date('2026-01-01T00:00:00Z').toISOString(),
      },
    ],
    total: totalPages * 10,
    page,
    pageSize: 10,
    totalPages,
  };
}

describe('RiskDetailPage initiative picker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseRouter.mockReturnValue({ push: jest.fn(), query: { id: 'risk-1' } });
    mockUseSession.mockReturnValue({
      data: { accessToken: 'token-123', user: { name: 'CISO', role: 'CISO' } },
      status: 'authenticated',
    });
    mockGetRisk.mockResolvedValue(baseRisk());
  });

  it('loads the first page of initiatives on mount with no search term', async () => {
    mockListInitiatives.mockResolvedValue(initiativePage(1, 1));

    render(<RiskDetailPage />);

    await waitFor(() => expect(screen.getByText('Initiative on page 1 (PLANNED)')).toBeInTheDocument());
    expect(mockListInitiatives).toHaveBeenCalledWith('token-123', { search: '', page: 1, pageSize: 10 });
  });

  it('debounces search input and resets to page 1', async () => {
    jest.useFakeTimers();
    mockListInitiatives.mockResolvedValue(initiativePage(1, 1));

    render(<RiskDetailPage />);
    await waitFor(() => expect(screen.getByText('Initiative on page 1 (PLANNED)')).toBeInTheDocument());

    mockListInitiatives.mockClear();
    mockListInitiatives.mockResolvedValue(initiativePage(1, 1));
    fireEvent.change(screen.getByPlaceholderText('Search initiatives by title…'), {
      target: { value: 'firewall' },
    });

    // Before the debounce fires, no new call yet.
    expect(mockListInitiatives).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(300);
    });
    jest.useRealTimers();

    await waitFor(() =>
      expect(mockListInitiatives).toHaveBeenCalledWith('token-123', {
        search: 'firewall',
        page: 1,
        pageSize: 10,
      }),
    );
  });

  it('advances to the next page and requests it from the API', async () => {
    mockListInitiatives.mockResolvedValueOnce(initiativePage(1, 2));

    render(<RiskDetailPage />);
    await waitFor(() => expect(screen.getByText('Initiative on page 1 (PLANNED)')).toBeInTheDocument());
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();

    mockListInitiatives.mockResolvedValueOnce(initiativePage(2, 2));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => expect(screen.getByText('Initiative on page 2 (PLANNED)')).toBeInTheDocument());
    expect(mockListInitiatives).toHaveBeenLastCalledWith('token-123', { search: '', page: 2, pageSize: 10 });
  });

  it('lets the user select an initiative from the list and enables Link', async () => {
    mockListInitiatives.mockResolvedValue(initiativePage(1, 1));

    render(<RiskDetailPage />);
    await waitFor(() => expect(screen.getByText('Initiative on page 1 (PLANNED)')).toBeInTheDocument());

    const linkButton = screen.getByRole('button', { name: 'Link' });
    expect(linkButton).toBeDisabled();

    fireEvent.click(screen.getByText('Initiative on page 1 (PLANNED)'));
    expect(linkButton).toBeEnabled();
  });
});
