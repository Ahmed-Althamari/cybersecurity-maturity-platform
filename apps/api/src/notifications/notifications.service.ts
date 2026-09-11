import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

export type DueDateAlertType = 'RISK' | 'REMEDIATION_INITIATIVE';
export type DueDateAlertUrgency = 'OVERDUE' | 'DUE_SOON';

export interface DueDateAlert {
  id: string;
  type: DueDateAlertType;
  title: string;
  status: string;
  dueDate: string;
  urgency: DueDateAlertUrgency;
  daysUntilDue: number;
}

// How far ahead an approaching (not-yet-overdue) deadline counts as worth surfacing. There's no
// email/push infrastructure in this app (see docs/security-architecture.md) — this is a live,
// computed "what needs attention" view rather than a persisted, dismissible notification feed, so
// there's nothing to clean up and nothing that can go stale.
const DUE_SOON_WINDOW_DAYS = 14;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toAlert(id: string, type: DueDateAlertType, title: string, status: string, dueDate: Date, now: Date): DueDateAlert {
  const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / MS_PER_DAY);
  return {
    id,
    type,
    title,
    status,
    dueDate: dueDate.toISOString(),
    urgency: daysUntilDue < 0 ? 'OVERDUE' : 'DUE_SOON',
    daysUntilDue,
  };
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async getDueDateAlerts(tenantId: string, organisationId: string): Promise<DueDateAlert[]> {
    const now = new Date();
    const horizon = new Date(now.getTime() + DUE_SOON_WINDOW_DAYS * MS_PER_DAY);

    const [risks, initiatives] = await Promise.all([
      this.prisma.risk.findMany({
        where: {
          tenantId,
          organisationId,
          deletedAt: null,
          status: { not: 'CLOSED' },
          targetDate: { not: null, lte: horizon },
        },
        select: { id: true, title: true, status: true, targetDate: true },
      }),
      this.prisma.remediationInitiative.findMany({
        where: {
          tenantId,
          organisationId,
          deletedAt: null,
          status: { not: 'COMPLETED' },
          targetCompletionDate: { not: null, lte: horizon },
        },
        select: { id: true, title: true, status: true, targetCompletionDate: true },
      }),
    ]);

    const alerts = [
      ...risks.map((risk) => toAlert(risk.id, 'RISK' as const, risk.title, risk.status, risk.targetDate!, now)),
      ...initiatives.map((initiative) =>
        toAlert(initiative.id, 'REMEDIATION_INITIATIVE' as const, initiative.title, initiative.status, initiative.targetCompletionDate!, now),
      ),
    ];

    return alerts.sort((a, b) => a.daysUntilDue - b.daysUntilDue);
  }
}
