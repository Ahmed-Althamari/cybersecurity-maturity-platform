import type { LlmClient } from '../assessments/import-mapping/llm-client';
import type { AssistantNotesService } from '../assistant-notes/assistant-notes.service';
import type { LlmSettingsService } from '../llm-settings/llm-settings.service';
import type { MailService } from '../mail/mail.service';
import type { DueDateAlert, NotificationsService } from '../notifications/notifications.service';
import type { PrismaService } from '../prisma/prisma.service';

import { AssistantDigestService } from './assistant-digest.service';

const TENANT_ID = 'tenant-1';
const ORG_ID = 'org-1';

const OVERDUE_ALERT: DueDateAlert = {
  id: 'risk-1',
  type: 'RISK',
  title: 'Unpatched vendor CVE',
  status: 'OPEN',
  dueDate: '2026-01-01T00:00:00.000Z',
  urgency: 'OVERDUE',
  daysUntilDue: -3,
};

describe('AssistantDigestService', () => {
  let prisma: {
    assistantDigest: Record<string, jest.Mock>;
    organisation: Record<string, jest.Mock>;
    userRoleAssignment: Record<string, jest.Mock>;
  };
  let notificationsService: { getDueDateAlerts: jest.Mock };
  let assistantNotesService: { findAllForOrganisation: jest.Mock };
  let llmSettingsService: { assertUnderUsageLimit: jest.Mock; resolveClientForTenant: jest.Mock; recordUsage: jest.Mock };
  let mailService: { send: jest.Mock };
  let service: AssistantDigestService;

  beforeEach(() => {
    prisma = {
      assistantDigest: { create: jest.fn(), findMany: jest.fn() },
      organisation: { findMany: jest.fn() },
      userRoleAssignment: { findMany: jest.fn().mockResolvedValue([]) },
    };
    notificationsService = { getDueDateAlerts: jest.fn().mockResolvedValue([]) };
    assistantNotesService = { findAllForOrganisation: jest.fn().mockResolvedValue([]) };
    llmSettingsService = {
      assertUnderUsageLimit: jest.fn().mockResolvedValue(undefined),
      resolveClientForTenant: jest.fn().mockResolvedValue(null),
      recordUsage: jest.fn().mockResolvedValue(undefined),
    };
    mailService = { send: jest.fn().mockResolvedValue({ sent: false }) };
    prisma.assistantDigest.create.mockImplementation(({ data }) => Promise.resolve({ id: 'digest-1', ...data }));

    service = new AssistantDigestService(
      prisma as unknown as PrismaService,
      notificationsService as unknown as NotificationsService,
      assistantNotesService as unknown as AssistantNotesService,
      llmSettingsService as unknown as LlmSettingsService,
      mailService as unknown as MailService,
    );
  });

  describe('generateForOrganisation', () => {
    it('persists a "nothing due" digest without calling AI or mail when there are no alerts', async () => {
      const result = await service.generateForOrganisation(TENANT_ID, ORG_ID);

      expect(result).toMatchObject({ alertCount: 0, aiGenerated: false, emailSent: false, recipientCount: 0 });
      expect(llmSettingsService.resolveClientForTenant).not.toHaveBeenCalled();
      expect(mailService.send).not.toHaveBeenCalled();
    });

    it('falls back to a templated summary when the tenant has no configured AI provider', async () => {
      notificationsService.getDueDateAlerts.mockResolvedValue([OVERDUE_ALERT]);
      llmSettingsService.resolveClientForTenant.mockResolvedValue(null);

      const result = await service.generateForOrganisation(TENANT_ID, ORG_ID);

      expect(result.aiGenerated).toBe(false);
      expect(result.summary).toContain('Unpatched vendor CVE');
      expect(result.alertCount).toBe(1);
    });

    it('uses the AI-generated summary when a provider is configured, and records usage', async () => {
      notificationsService.getDueDateAlerts.mockResolvedValue([OVERDUE_ALERT]);
      const client: LlmClient = { complete: jest.fn().mockResolvedValue('One vendor CVE is overdue and needs attention.') };
      llmSettingsService.resolveClientForTenant.mockResolvedValue(client);

      const result = await service.generateForOrganisation(TENANT_ID, ORG_ID);

      expect(result.aiGenerated).toBe(true);
      expect(result.summary).toBe('One vendor CVE is overdue and needs attention.');
      expect(llmSettingsService.recordUsage).toHaveBeenCalledWith(TENANT_ID, 'digest', true);
    });

    it('falls back to the templated summary and records a failed usage event when the AI call throws', async () => {
      notificationsService.getDueDateAlerts.mockResolvedValue([OVERDUE_ALERT]);
      const client: LlmClient = { complete: jest.fn().mockRejectedValue(new Error('provider unreachable')) };
      llmSettingsService.resolveClientForTenant.mockResolvedValue(client);

      const result = await service.generateForOrganisation(TENANT_ID, ORG_ID);

      expect(result.aiGenerated).toBe(false);
      expect(result.summary).toContain('Unpatched vendor CVE');
      expect(llmSettingsService.recordUsage).toHaveBeenCalledWith(TENANT_ID, 'digest', false);
    });

    it('skips the AI call entirely once the daily usage limit is reached, still producing a digest', async () => {
      notificationsService.getDueDateAlerts.mockResolvedValue([OVERDUE_ALERT]);
      llmSettingsService.assertUnderUsageLimit.mockRejectedValue(new Error('limit reached'));

      const result = await service.generateForOrganisation(TENANT_ID, ORG_ID);

      expect(llmSettingsService.resolveClientForTenant).not.toHaveBeenCalled();
      expect(result.aiGenerated).toBe(false);
    });

    it('emails active recipients with a matching role, deduplicated, when there are alerts to report', async () => {
      notificationsService.getDueDateAlerts.mockResolvedValue([OVERDUE_ALERT]);
      prisma.userRoleAssignment.findMany.mockResolvedValue([
        { user: { email: 'ciso@example.com', isActive: true, deletedAt: null } },
        { user: { email: 'ciso@example.com', isActive: true, deletedAt: null } },
        { user: { email: 'inactive@example.com', isActive: false, deletedAt: null } },
      ]);
      mailService.send.mockResolvedValue({ sent: true });

      const result = await service.generateForOrganisation(TENANT_ID, ORG_ID);

      expect(mailService.send).toHaveBeenCalledWith(
        expect.objectContaining({ to: ['ciso@example.com'], subject: expect.stringContaining('1 item(s)') }),
      );
      expect(result.emailSent).toBe(true);
      expect(result.recipientCount).toBe(1);
    });

    it('does not attempt to send mail when there is nothing to report', async () => {
      await service.generateForOrganisation(TENANT_ID, ORG_ID);
      expect(mailService.send).not.toHaveBeenCalled();
    });
  });

  describe('listForOrganisation', () => {
    it('scopes to the tenant and organisation, newest first, capped at the given limit', async () => {
      prisma.assistantDigest.findMany.mockResolvedValue([{ id: 'digest-1' }]);

      const result = await service.listForOrganisation(TENANT_ID, ORG_ID, 5);

      expect(result).toEqual([{ id: 'digest-1' }]);
      expect(prisma.assistantDigest.findMany).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID, organisationId: ORG_ID },
        orderBy: { generatedAt: 'desc' },
        take: 5,
      });
    });
  });

  describe('runDailyDigests', () => {
    it('generates a digest for every active organisation and keeps going when one fails', async () => {
      prisma.organisation.findMany.mockResolvedValue([
        { id: 'org-1', tenantId: 'tenant-1' },
        { id: 'org-2', tenantId: 'tenant-2' },
      ]);
      const spy = jest
        .spyOn(service, 'generateForOrganisation')
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce({ id: 'digest-2' } as never);

      await service.runDailyDigests();

      expect(spy).toHaveBeenCalledWith('tenant-1', 'org-1');
      expect(spy).toHaveBeenCalledWith('tenant-2', 'org-2');
      expect(prisma.organisation.findMany).toHaveBeenCalledWith({
        where: { isActive: true, deletedAt: null },
        select: { id: true, tenantId: true },
      });
    });
  });
});
