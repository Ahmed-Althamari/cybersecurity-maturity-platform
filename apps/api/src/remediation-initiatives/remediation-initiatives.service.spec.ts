import { BadRequestException, NotFoundException } from '@nestjs/common';

import type { AssessmentsService } from '../assessments/assessments.service';
import { PrismaService } from '../prisma/prisma.service';

import { computePriority, RemediationInitiativesService } from './remediation-initiatives.service';

type MockModel = Record<string, jest.Mock>;

describe('computePriority', () => {
  it.each([
    [5, 5, 5, 1, 1], // 125 -> band 1
    [4, 4, 3, 1, 2], // 48 -> band 2
    [3, 3, 2, 1, 3], // 18 -> band 3
    [2, 2, 2, 1, 4], // 8 -> band 4
    [1, 1, 1, 1, 5], // 1 -> band 5
  ])('bands riskScore=%i gap=%i businessCriticality=%i weight=%i as priority %i', (riskScore, gap, businessCriticality, weight, expected) => {
    expect(computePriority(riskScore, gap, businessCriticality, weight)).toBe(expected);
  });
});

describe('RemediationInitiativesService', () => {
  let service: RemediationInitiativesService;
  let prisma: {
    organisation: MockModel;
    risk: MockModel;
    remediationInitiative: MockModel;
    assessment: MockModel;
    assessmentItem: MockModel;
  };
  let assessmentsService: { getGaps: jest.Mock };

  beforeEach(() => {
    prisma = {
      organisation: { findFirst: jest.fn() },
      risk: { count: jest.fn(), findFirst: jest.fn() },
      remediationInitiative: { create: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
      assessment: { findFirst: jest.fn() },
      assessmentItem: { findFirst: jest.fn() },
    };
    assessmentsService = { getGaps: jest.fn() };
    service = new RemediationInitiativesService(prisma as unknown as PrismaService, assessmentsService as unknown as AssessmentsService);
  });

  describe('create', () => {
    const dto = { organisationId: 'org-a', title: 'Roll out MFA everywhere' };

    it('rejects an organisation that does not belong to the tenant', async () => {
      prisma.organisation.findFirst.mockResolvedValueOnce(null);
      await expect(service.create('tenant-a', dto)).rejects.toThrow(NotFoundException);
    });

    it('rejects riskIds that do not all belong to this organisation', async () => {
      prisma.organisation.findFirst.mockResolvedValueOnce({ id: 'org-a' });
      prisma.risk.count.mockResolvedValueOnce(1);

      await expect(service.create('tenant-a', { ...dto, riskIds: ['risk-1', 'risk-2'] })).rejects.toThrow(BadRequestException);
    });

    it('defaults priority and complexity to 3 and status to PLANNED', async () => {
      prisma.organisation.findFirst.mockResolvedValueOnce({ id: 'org-a' });
      prisma.remediationInitiative.create.mockResolvedValueOnce({ id: 'init-1' });

      await service.create('tenant-a', dto);

      const createArgs = prisma.remediationInitiative.create.mock.calls[0][0];
      expect(createArgs.data.priority).toBe(3);
      expect(createArgs.data.complexity).toBe(3);
      expect(createArgs.data.status).toBe('PLANNED');
      expect(createArgs.data.tenantId).toBe('tenant-a');
      expect(createArgs.data.risks).toBeUndefined();
    });

    it('connects validated riskIds', async () => {
      prisma.organisation.findFirst.mockResolvedValueOnce({ id: 'org-a' });
      prisma.risk.count.mockResolvedValueOnce(2);
      prisma.remediationInitiative.create.mockResolvedValueOnce({ id: 'init-1' });

      await service.create('tenant-a', { ...dto, riskIds: ['risk-1', 'risk-2'] });

      const createArgs = prisma.remediationInitiative.create.mock.calls[0][0];
      expect(createArgs.data.risks).toEqual({ connect: [{ id: 'risk-1' }, { id: 'risk-2' }] });
    });
  });

  describe('findAll', () => {
    it('scopes to tenant and organisation', async () => {
      prisma.remediationInitiative.findMany.mockResolvedValueOnce([]);
      await service.findAll('tenant-a', 'org-a', {});

      expect(prisma.remediationInitiative.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tenantId: 'tenant-a', organisationId: 'org-a', deletedAt: null }) }),
      );
    });

    it('sorts by priority when sort=priority', async () => {
      prisma.remediationInitiative.findMany.mockResolvedValueOnce([]);
      await service.findAll('tenant-a', 'org-a', { sort: 'priority' });

      expect(prisma.remediationInitiative.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: expect.arrayContaining([{ priority: 'asc' }]) }),
      );
    });
  });

  describe('findOne', () => {
    it('404s an initiative from another tenant', async () => {
      prisma.remediationInitiative.findFirst.mockResolvedValueOnce(null);
      await expect(service.findOne('init-1', 'tenant-b')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('stamps actualCompletionDate to now when status becomes COMPLETED without an explicit date', async () => {
      prisma.remediationInitiative.findFirst.mockResolvedValueOnce({ id: 'init-1' });
      prisma.remediationInitiative.update.mockResolvedValueOnce({ id: 'init-1' });

      await service.update('init-1', 'tenant-a', { status: 'COMPLETED' });

      const updateArgs = prisma.remediationInitiative.update.mock.calls[0][0];
      expect(updateArgs.data.actualCompletionDate).toBeInstanceOf(Date);
      expect(updateArgs.data.status).toBe('COMPLETED');
    });

    it('prefers an explicit actualCompletionDate over the auto-stamp', async () => {
      prisma.remediationInitiative.findFirst.mockResolvedValueOnce({ id: 'init-1' });
      prisma.remediationInitiative.update.mockResolvedValueOnce({ id: 'init-1' });

      await service.update('init-1', 'tenant-a', { status: 'COMPLETED', actualCompletionDate: '2026-01-01T00:00:00.000Z' });

      const updateArgs = prisma.remediationInitiative.update.mock.calls[0][0];
      expect(updateArgs.data.actualCompletionDate).toEqual(new Date('2026-01-01T00:00:00.000Z'));
    });

    it('leaves actualCompletionDate untouched for a non-terminal status change', async () => {
      prisma.remediationInitiative.findFirst.mockResolvedValueOnce({ id: 'init-1' });
      prisma.remediationInitiative.update.mockResolvedValueOnce({ id: 'init-1' });

      await service.update('init-1', 'tenant-a', { status: 'IN_PROGRESS' });

      const updateArgs = prisma.remediationInitiative.update.mock.calls[0][0];
      expect(updateArgs.data.actualCompletionDate).toBeUndefined();
    });
  });

  describe('remove', () => {
    it('soft-deletes rather than hard-deletes', async () => {
      prisma.remediationInitiative.findFirst.mockResolvedValueOnce({ id: 'init-1' });
      prisma.remediationInitiative.update.mockResolvedValueOnce({});

      await service.remove('init-1', 'tenant-a');

      expect(prisma.remediationInitiative.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'init-1' }, data: expect.objectContaining({ deletedAt: expect.any(Date) }) }),
      );
    });
  });

  describe('linkRisk', () => {
    it('404s a risk that does not belong to the initiative organisation', async () => {
      prisma.remediationInitiative.findFirst.mockResolvedValueOnce({ id: 'init-1', organisationId: 'org-a' });
      prisma.risk.findFirst.mockResolvedValueOnce(null);

      await expect(service.linkRisk('init-1', 'tenant-a', 'risk-foreign')).rejects.toThrow(NotFoundException);
    });

    it('connects a validated risk', async () => {
      prisma.remediationInitiative.findFirst.mockResolvedValueOnce({ id: 'init-1', organisationId: 'org-a' });
      prisma.risk.findFirst.mockResolvedValueOnce({ id: 'risk-1' });
      prisma.remediationInitiative.update.mockResolvedValueOnce({ id: 'init-1' });

      await service.linkRisk('init-1', 'tenant-a', 'risk-1');

      expect(prisma.remediationInitiative.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'init-1' }, data: { risks: { connect: { id: 'risk-1' } } } }),
      );
    });
  });

  describe('unlinkRisk', () => {
    it('disconnects a risk', async () => {
      prisma.remediationInitiative.findFirst.mockResolvedValueOnce({ id: 'init-1', organisationId: 'org-a' });
      prisma.remediationInitiative.update.mockResolvedValueOnce({ id: 'init-1' });

      await service.unlinkRisk('init-1', 'tenant-a', 'risk-1');

      expect(prisma.remediationInitiative.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'init-1' }, data: { risks: { disconnect: { id: 'risk-1' } } } }),
      );
    });
  });

  describe('generateFromGaps', () => {
    it('404s when no assessmentId is given and no SUBMITTED assessment exists', async () => {
      prisma.assessment.findFirst.mockResolvedValueOnce(null);
      await expect(service.generateFromGaps('tenant-a', 'org-a')).rejects.toThrow(NotFoundException);
    });

    it('skips a gap that already has a non-terminal tracking initiative', async () => {
      prisma.assessment.findFirst.mockResolvedValueOnce({ id: 'assess-1' });
      assessmentsService.getGaps.mockResolvedValueOnce([{ code: 'PR.AC-01', label: 'Access control', current: 1, target: 3, gap: 2, depth: 2 }]);
      prisma.remediationInitiative.findFirst.mockResolvedValueOnce({ id: 'existing-init' });

      const created = await service.generateFromGaps('tenant-a', 'org-a');

      expect(created).toEqual([]);
      expect(prisma.remediationInitiative.create).not.toHaveBeenCalled();
    });

    it('creates a PLANNED initiative per open gap, with priority computed from the real assessment item', async () => {
      prisma.assessment.findFirst.mockResolvedValueOnce({ id: 'assess-1' });
      assessmentsService.getGaps.mockResolvedValueOnce([{ code: 'PR.AC-01', label: 'Access control', current: 1, target: 3, gap: 2, depth: 2 }]);
      prisma.remediationInitiative.findFirst.mockResolvedValueOnce(null);
      prisma.assessmentItem.findFirst.mockResolvedValueOnce({ riskLevel: 'HIGH', businessCriticality: 4, weight: 1 });
      prisma.remediationInitiative.create.mockResolvedValueOnce({ id: 'init-new' });

      const created = await service.generateFromGaps('tenant-a', 'org-a', 'assess-1', 5);

      expect(created).toEqual([{ id: 'init-new' }]);
      const createArgs = prisma.remediationInitiative.create.mock.calls[0][0];
      expect(createArgs.data.securityCapability).toBe('PR.AC-01');
      expect(createArgs.data.status).toBe('PLANNED');
      // riskScore(HIGH=4) x gap(2) x businessCriticality(4) x weight(1) = 32 -> band 2
      expect(createArgs.data.priority).toBe(2);
    });

    it('falls back to neutral defaults when no assessment item backs the gap', async () => {
      prisma.assessment.findFirst.mockResolvedValueOnce({ id: 'assess-1' });
      assessmentsService.getGaps.mockResolvedValueOnce([{ code: 'PR.AC-02', label: 'Identity mgmt', current: 2, target: 4, gap: 2, depth: 2 }]);
      prisma.remediationInitiative.findFirst.mockResolvedValueOnce(null);
      prisma.assessmentItem.findFirst.mockResolvedValueOnce(null);
      prisma.remediationInitiative.create.mockResolvedValueOnce({ id: 'init-new-2' });

      await service.generateFromGaps('tenant-a', 'org-a', 'assess-1');

      const createArgs = prisma.remediationInitiative.create.mock.calls[0][0];
      // riskScore(default 3) x gap(2) x businessCriticality(default 3) x weight(default 1) = 18 -> band 3
      expect(createArgs.data.priority).toBe(3);
    });
  });
});
