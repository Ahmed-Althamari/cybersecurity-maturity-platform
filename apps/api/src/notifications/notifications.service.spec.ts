import type { PrismaService } from '../prisma/prisma.service';

import { NotificationsService } from './notifications.service';

type MockModel = Record<string, jest.Mock>;

const TENANT_ID = 'tenant-1';
const ORG_ID = 'org-1';
const DAY_MS = 24 * 60 * 60 * 1000;

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: { risk: MockModel; remediationInitiative: MockModel };

  beforeEach(() => {
    prisma = {
      risk: { findMany: jest.fn().mockResolvedValue([]) },
      remediationInitiative: { findMany: jest.fn().mockResolvedValue([]) },
    };
    service = new NotificationsService(prisma as unknown as PrismaService);
  });

  it('queries only non-closed risks and non-completed initiatives, scoped to the tenant/org', async () => {
    await service.getDueDateAlerts(TENANT_ID, ORG_ID);

    expect(prisma.risk.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT_ID, organisationId: ORG_ID, status: { not: 'CLOSED' } }),
      }),
    );
    expect(prisma.remediationInitiative.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT_ID, organisationId: ORG_ID, status: { not: 'COMPLETED' } }),
      }),
    );
  });

  it('marks a past due date as OVERDUE with a negative days count', async () => {
    const pastDate = new Date(Date.now() - 3 * DAY_MS);
    prisma.risk.findMany.mockResolvedValue([{ id: 'risk-1', title: 'Overdue risk', status: 'OPEN', targetDate: pastDate }]);

    const [alert] = await service.getDueDateAlerts(TENANT_ID, ORG_ID);

    expect(alert).toMatchObject({ id: 'risk-1', type: 'RISK', urgency: 'OVERDUE' });
    expect(alert.daysUntilDue).toBeLessThan(0);
  });

  it('marks a date inside the 14-day window as DUE_SOON', async () => {
    const soonDate = new Date(Date.now() + 5 * DAY_MS);
    prisma.remediationInitiative.findMany.mockResolvedValue([
      { id: 'init-1', title: 'Upcoming initiative', status: 'IN_PROGRESS', targetCompletionDate: soonDate },
    ]);

    const [alert] = await service.getDueDateAlerts(TENANT_ID, ORG_ID);

    expect(alert).toMatchObject({ id: 'init-1', type: 'REMEDIATION_INITIATIVE', urgency: 'DUE_SOON' });
    expect(alert.daysUntilDue).toBeGreaterThanOrEqual(0);
  });

  it('sorts the combined risk + initiative alerts by urgency, most overdue first', async () => {
    prisma.risk.findMany.mockResolvedValue([
      { id: 'risk-soon', title: 'Risk due in 10 days', status: 'OPEN', targetDate: new Date(Date.now() + 10 * DAY_MS) },
    ]);
    prisma.remediationInitiative.findMany.mockResolvedValue([
      { id: 'init-overdue', title: 'Overdue initiative', status: 'BLOCKED', targetCompletionDate: new Date(Date.now() - 1 * DAY_MS) },
    ]);

    const alerts = await service.getDueDateAlerts(TENANT_ID, ORG_ID);

    expect(alerts.map((a) => a.id)).toEqual(['init-overdue', 'risk-soon']);
  });
});
