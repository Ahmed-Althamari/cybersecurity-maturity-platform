import { render, screen, waitFor } from '@testing-library/react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import { api, ApiError } from '@/lib/api';
import AuditPage from '@/pages/audit/index';

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
  signOut: jest.fn(),
}));
jest.mock('next/router', () => ({ useRouter: jest.fn() }));
jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  api: { getAuditSummary: jest.fn() },
}));

const mockUseSession = useSession as jest.Mock;
const mockUseRouter = useRouter as jest.Mock;
const mockGetAuditSummary = api.getAuditSummary as jest.Mock;

describe('AuditPage', () => {
  const push = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseRouter.mockReturnValue({ push });
  });

  it('redirects to sign-in when unauthenticated', () => {
    mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated' });
    render(<AuditPage />);
    expect(push).toHaveBeenCalledWith('/auth/signin');
  });

  it('renders the summary KPIs and recent events once loaded', async () => {
    mockUseSession.mockReturnValue({
      data: { accessToken: 'token-123', user: { name: 'CISO', role: 'CISO' } },
      status: 'authenticated',
    });
    mockGetAuditSummary.mockResolvedValue({
      totalEvents: 2,
      byAction: { LOGIN: 1, CREATE: 1, LOGOUT: 0, UPDATE: 0, DELETE: 0, UPLOAD: 0, DOWNLOAD: 0, EXPORT: 0, IMPORT: 0 },
      byResource: { Auth: 1, Risks: 1 },
      recentEvents: [
        {
          id: 'evt-1',
          userId: 'user-1',
          action: 'CREATE',
          resource: 'Risks',
          resourceId: 'risk-1',
          description: 'POST /api/v1/risks',
          createdAt: new Date('2026-01-01T00:00:00Z').toISOString(),
        },
      ],
    });

    render(<AuditPage />);

    await waitFor(() => expect(screen.getByText('Total Events')).toBeInTheDocument());
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('POST /api/v1/risks')).toBeInTheDocument();
    expect(screen.getByText('risk-1')).toBeInTheDocument();
  });

  it('shows a friendly message on a 403 instead of a raw error', async () => {
    mockUseSession.mockReturnValue({
      data: { accessToken: 'token-123', user: { name: 'Viewer', role: 'READ_ONLY_VIEWER' } },
      status: 'authenticated',
    });
    mockGetAuditSummary.mockRejectedValue(new ApiError(403, 'Forbidden'));

    render(<AuditPage />);

    await waitFor(() =>
      expect(screen.getByText("You don't have permission to view the audit log.")).toBeInTheDocument(),
    );
  });
});
