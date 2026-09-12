import { UserRole } from '@cmmp/shared';
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { AssistantNotesService } from '../assistant-notes/assistant-notes.service';
import { LlmSettingsService } from '../llm-settings/llm-settings.service';
import { MailService } from '../mail/mail.service';
import { NotificationsService, type DueDateAlert } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

const DIGEST_RECIPIENT_ROLES: string[] = [
  UserRole.PLATFORM_ADMIN,
  UserRole.ORGANISATION_ADMIN,
  UserRole.CISO,
  UserRole.GRC_MANAGER,
  UserRole.SECURITY_ARCHITECT,
];

function templatedSummary(alerts: DueDateAlert[]): string {
  if (alerts.length === 0) {
    return 'No risks or remediation initiatives are overdue or due soon.';
  }
  const overdue = alerts.filter((a) => a.urgency === 'OVERDUE');
  const dueSoon = alerts.filter((a) => a.urgency === 'DUE_SOON');
  const parts: string[] = [];
  if (overdue.length > 0) {
    parts.push(`${overdue.length} item(s) overdue: ${overdue.slice(0, 5).map((a) => a.title).join(', ')}${overdue.length > 5 ? ', …' : ''}.`);
  }
  if (dueSoon.length > 0) {
    parts.push(`${dueSoon.length} item(s) due within 14 days: ${dueSoon.slice(0, 5).map((a) => a.title).join(', ')}${dueSoon.length > 5 ? ', …' : ''}.`);
  }
  return parts.join(' ');
}

function buildPrompt(alerts: DueDateAlert[], notes: string[]): { system: string; user: string } {
  const system =
    'You are a security compliance assistant. Write a short (3-5 sentence) plain-text digest summarizing the risk and remediation ' +
    'items below for a busy security leader. Be direct, prioritize what is overdue, and do not invent items not listed.';
  const alertLines = alerts
    .map(
      (a) =>
        `- [${a.urgency}] ${a.type === 'RISK' ? 'Risk' : 'Remediation initiative'}: "${a.title}" (status: ${a.status}, ` +
        `${a.urgency === 'OVERDUE' ? `${Math.abs(a.daysUntilDue)} day(s) overdue` : `due in ${a.daysUntilDue} day(s)`})`,
    )
    .join('\n');
  const noteLines = notes.length > 0 ? `\n\nStanding context from the team:\n${notes.map((n) => `- ${n}`).join('\n')}` : '';
  const user = `Here are the current due-date alerts:\n${alertLines}${noteLines}`;
  return { system, user };
}

/**
 * The scheduled counterpart to Notifications' live "what needs attention" view (see
 * NotificationsService.getDueDateAlerts) — where that endpoint is a computed-on-request read
 * model with nothing persisted, this generates and stores one digest per organisation on a daily
 * cron, optionally AI-summarized using the tenant's own configured provider chain (see
 * LlmSettingsService), and attempts a best-effort email to the organisation's admins/CISO/GRC
 * roles via MailService. Every failure mode degrades gracefully rather than blocking generation:
 * no AI provider configured, the tenant's usage limit reached, or SMTP not configured all still
 * produce a persisted digest row — just without that leg.
 */
@Injectable()
export class AssistantDigestService {
  private readonly logger = new Logger(AssistantDigestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly assistantNotesService: AssistantNotesService,
    private readonly llmSettingsService: LlmSettingsService,
    private readonly mailService: MailService,
  ) {}

  async listForOrganisation(tenantId: string, organisationId: string, limit = 10) {
    return this.prisma.assistantDigest.findMany({
      where: { tenantId, organisationId },
      orderBy: { generatedAt: 'desc' },
      take: limit,
    });
  }

  async generateForOrganisation(tenantId: string, organisationId: string) {
    const [alerts, notes] = await Promise.all([
      this.notificationsService.getDueDateAlerts(tenantId, organisationId),
      this.assistantNotesService.findAllForOrganisation(tenantId, organisationId),
    ]);

    let summary = templatedSummary(alerts);
    let aiGenerated = false;

    if (alerts.length > 0) {
      try {
        await this.llmSettingsService.assertUnderUsageLimit(tenantId);
        const client = await this.llmSettingsService.resolveClientForTenant(tenantId);
        if (client) {
          const { system, user } = buildPrompt(alerts, notes.map((n) => n.content));
          const aiSummary = await client.complete(system, user);
          summary = aiSummary.trim();
          aiGenerated = true;
          void this.llmSettingsService.recordUsage(tenantId, 'digest', true);
        }
      } catch (error) {
        this.logger.warn(
          `AI digest summary unavailable for organisation ${organisationId}, using a templated summary instead: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        void this.llmSettingsService.recordUsage(tenantId, 'digest', false);
      }
    }

    let recipients: string[] = [];
    let mailResult: { sent: boolean } = { sent: false };
    if (alerts.length > 0) {
      recipients = await this.resolveRecipients(tenantId, organisationId);
      mailResult = await this.mailService.send({
        to: recipients,
        subject: `CMMP digest: ${alerts.length} item(s) need attention`,
        text: summary,
      });
    }

    return this.prisma.assistantDigest.create({
      data: {
        tenantId,
        organisationId,
        summary,
        alertCount: alerts.length,
        aiGenerated,
        emailSent: mailResult.sent,
        recipientCount: recipients.length,
      },
    });
  }

  private async resolveRecipients(tenantId: string, organisationId: string): Promise<string[]> {
    const assignments = await this.prisma.userRoleAssignment.findMany({
      where: {
        tenantId,
        role: { in: DIGEST_RECIPIENT_ROLES },
        deletedAt: null,
        OR: [{ organisationId }, { organisationId: null }],
      },
      include: { user: true },
    });

    const emails = new Set<string>();
    for (const assignment of assignments) {
      if (assignment.user.isActive && !assignment.user.deletedAt) {
        emails.add(assignment.user.email);
      }
    }
    return Array.from(emails);
  }

  /**
   * Runs once a day for every active organisation across every tenant. One organisation's failure
   * (a downed AI provider that somehow escaped the try/catch above, a DB blip) is logged and
   * skipped rather than aborting the rest of the batch — matching the "never break the caller"
   * convention used throughout the AI-assisted features (see LlmSettingsService.recordUsage).
   */
  @Cron(CronExpression.EVERY_DAY_AT_7AM)
  async runDailyDigests(): Promise<void> {
    const organisations = await this.prisma.organisation.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true, tenantId: true },
    });

    for (const organisation of organisations) {
      try {
        await this.generateForOrganisation(organisation.tenantId, organisation.id);
      } catch (error) {
        this.logger.error(
          `Failed to generate digest for organisation ${organisation.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
}
