import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { AssessmentsService } from './assessments.service';

type MockModel = Record<string, jest.Mock>;

describe('AssessmentsService', () => {
  let service: AssessmentsService;
  let prisma: {
    organisation: MockModel;
    framework: MockModel;
    assessmentTemplate: MockModel;
    assessment: MockModel;
    assessmentQuestion: MockModel;
    assessmentItem: MockModel;
    assessmentHistory: MockModel;
  };

  beforeEach(() => {
    prisma = {
      organisation: { findFirst: jest.fn() },
      framework: { findFirst: jest.fn() },
      assessmentTemplate: { findFirst: jest.fn(), create: jest.fn() },
      assessment: { create: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
      assessmentQuestion: { findFirst: jest.fn(), count: jest.fn() },
      assessmentItem: { upsert: jest.fn(), count: jest.fn() },
      assessmentHistory: { findFirst: jest.fn(), create: jest.fn() },
    };

    service = new AssessmentsService(prisma as unknown as PrismaService);
  });

  describe('create', () => {
    const dto = { organisationId: 'org-a', frameworkId: 'fw-a', name: 'Q1 Assessment' };

    it('rejects an organisation that does not belong to the tenant', async () => {
      prisma.organisation.findFirst.mockResolvedValueOnce(null);

      await expect(service.create('tenant-a', 'user-1', dto)).rejects.toThrow(NotFoundException);
      expect(prisma.organisation.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'org-a', tenantId: 'tenant-a', deletedAt: null } }),
      );
    });

    it('rejects a framework that does not belong to the tenant', async () => {
      prisma.organisation.findFirst.mockResolvedValueOnce({ id: 'org-a' });
      prisma.framework.findFirst.mockResolvedValueOnce(null);

      await expect(service.create('tenant-a', 'user-1', dto)).rejects.toThrow(NotFoundException);
    });

    it('creates a default template when the framework has none yet', async () => {
      prisma.organisation.findFirst.mockResolvedValueOnce({ id: 'org-a' });
      prisma.framework.findFirst.mockResolvedValueOnce({ id: 'fw-a', name: 'NIST CSF 2.0' });
      prisma.assessmentTemplate.findFirst.mockResolvedValueOnce(null);
      prisma.assessmentTemplate.create.mockResolvedValueOnce({ id: 'template-new' });
      prisma.assessment.create.mockResolvedValueOnce({ id: 'assessment-1', status: 'DRAFT' });

      await service.create('tenant-a', 'user-1', dto);

      expect(prisma.assessmentTemplate.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ frameworkId: 'fw-a', isDefault: true }) }),
      );
      const createArgs = prisma.assessment.create.mock.calls[0][0];
      expect(createArgs.data.templateId).toBe('template-new');
      expect(createArgs.data.status).toBe('DRAFT');
      expect(createArgs.data.tenantId).toBe('tenant-a');
    });

    it('reuses an existing default template instead of creating a new one', async () => {
      prisma.organisation.findFirst.mockResolvedValueOnce({ id: 'org-a' });
      prisma.framework.findFirst.mockResolvedValueOnce({ id: 'fw-a', name: 'NIST CSF 2.0' });
      prisma.assessmentTemplate.findFirst.mockResolvedValueOnce({ id: 'template-existing' });
      prisma.assessment.create.mockResolvedValueOnce({ id: 'assessment-1' });

      await service.create('tenant-a', 'user-1', dto);

      expect(prisma.assessmentTemplate.create).not.toHaveBeenCalled();
      expect(prisma.assessment.create.mock.calls[0][0].data.templateId).toBe('template-existing');
    });
  });

  describe('tenant isolation', () => {
    it('scopes findAll to the requesting tenant', async () => {
      prisma.assessment.findMany.mockResolvedValueOnce([]);
      await service.findAll('tenant-a');

      expect(prisma.assessment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 'tenant-a', organisationId: undefined, status: undefined, deletedAt: null },
        }),
      );
    });

    it('404s findOne for an assessment in another tenant', async () => {
      prisma.assessment.findFirst.mockResolvedValueOnce(null);

      await expect(service.findOne('assessment-in-tenant-a', 'tenant-b')).rejects.toThrow(NotFoundException);
    });
  });

  describe('status transitions', () => {
    it('blocks update() once an assessment is SUBMITTED', async () => {
      prisma.assessment.findFirst.mockResolvedValueOnce({ id: 'a1', status: 'SUBMITTED' });

      await expect(service.update('a1', 'tenant-a', 'user-1', { name: 'New name' })).rejects.toThrow(ConflictException);
      expect(prisma.assessment.update).not.toHaveBeenCalled();
    });

    it('allows update() while DRAFT', async () => {
      prisma.assessment.findFirst.mockResolvedValueOnce({ id: 'a1', status: 'DRAFT' });
      prisma.assessment.update.mockResolvedValueOnce({ id: 'a1', name: 'New name' });

      await service.update('a1', 'tenant-a', 'user-1', { name: 'New name' });
      expect(prisma.assessment.update).toHaveBeenCalled();
    });
  });

  describe('upsertItem', () => {
    const baseAssessment = { id: 'a1', status: 'DRAFT', template: { frameworkId: 'fw-a' } };

    it('rejects once the assessment is no longer editable', async () => {
      prisma.assessment.findFirst.mockResolvedValueOnce({ ...baseAssessment, status: 'SUBMITTED' });

      await expect(service.upsertItem('a1', 'tenant-a', 'user-1', { questionId: 'q1' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('rejects a question that does not belong to the assessment framework', async () => {
      prisma.assessment.findFirst.mockResolvedValueOnce(baseAssessment);
      prisma.assessmentQuestion.findFirst.mockResolvedValueOnce(null);

      await expect(service.upsertItem('a1', 'tenant-a', 'user-1', { questionId: 'q-foreign' })).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.assessmentQuestion.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 'q-foreign',
            subcategory: { category: { function: { frameworkId: 'fw-a' } } },
          },
        }),
      );
    });

    it('transitions DRAFT to IN_PROGRESS and recomputes completionPercentage', async () => {
      prisma.assessment.findFirst.mockResolvedValueOnce(baseAssessment);
      prisma.assessmentQuestion.findFirst.mockResolvedValueOnce({ id: 'q1' });
      prisma.assessmentItem.upsert.mockResolvedValueOnce({ id: 'item-1', questionId: 'q1' });
      prisma.assessmentQuestion.count.mockResolvedValueOnce(106);
      prisma.assessmentItem.count.mockResolvedValueOnce(1);

      await service.upsertItem('a1', 'tenant-a', 'user-1', { questionId: 'q1' });

      expect(prisma.assessment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'a1' },
          data: expect.objectContaining({ status: 'IN_PROGRESS', completionPercentage: 1 }),
        }),
      );
    });

    it('leaves an already IN_PROGRESS assessment as-is', async () => {
      prisma.assessment.findFirst.mockResolvedValueOnce({ ...baseAssessment, status: 'IN_PROGRESS' });
      prisma.assessmentQuestion.findFirst.mockResolvedValueOnce({ id: 'q1' });
      prisma.assessmentItem.upsert.mockResolvedValueOnce({ id: 'item-1' });
      prisma.assessmentQuestion.count.mockResolvedValueOnce(106);
      prisma.assessmentItem.count.mockResolvedValueOnce(50);

      await service.upsertItem('a1', 'tenant-a', 'user-1', { questionId: 'q1' });

      expect(prisma.assessment.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'IN_PROGRESS' }) }),
      );
    });
  });

  describe('submit', () => {
    it('rejects submitting an assessment with no recorded items', async () => {
      prisma.assessment.findFirst.mockResolvedValueOnce({ id: 'a1', status: 'IN_PROGRESS', items: [] });

      await expect(service.submit('a1', 'tenant-a', 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('rejects submitting an already-submitted assessment', async () => {
      prisma.assessment.findFirst.mockResolvedValueOnce({ id: 'a1', status: 'SUBMITTED', items: [{ id: 'i1' }] });

      await expect(service.submit('a1', 'tenant-a', 'user-1')).rejects.toThrow(ConflictException);
    });

    it('rejects submitting an archived assessment', async () => {
      prisma.assessment.findFirst.mockResolvedValueOnce({ id: 'a1', status: 'ARCHIVED', items: [{ id: 'i1' }] });

      await expect(service.submit('a1', 'tenant-a', 'user-1')).rejects.toThrow(ConflictException);
    });

    it('marks the assessment SUBMITTED and appends a versioned history entry', async () => {
      prisma.assessment.findFirst.mockResolvedValueOnce({ id: 'a1', status: 'IN_PROGRESS', items: [{ id: 'i1' }] });
      prisma.assessment.update.mockResolvedValueOnce({
        id: 'a1',
        status: 'SUBMITTED',
        currentMaturity: 2.5,
        targetMaturity: 4.0,
      });
      prisma.assessmentHistory.findFirst.mockResolvedValueOnce({ version: 2 });
      prisma.assessmentHistory.create.mockResolvedValueOnce({});

      await service.submit('a1', 'tenant-a', 'user-1');

      expect(prisma.assessment.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'SUBMITTED' }) }),
      );
      expect(prisma.assessmentHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ assessmentId: 'a1', version: 3, status: 'SUBMITTED' }) }),
      );
    });

    it('starts history versioning at 1 when none exists yet', async () => {
      prisma.assessment.findFirst.mockResolvedValueOnce({ id: 'a1', status: 'IN_PROGRESS', items: [{ id: 'i1' }] });
      prisma.assessment.update.mockResolvedValueOnce({ id: 'a1', status: 'SUBMITTED' });
      prisma.assessmentHistory.findFirst.mockResolvedValueOnce(null);
      prisma.assessmentHistory.create.mockResolvedValueOnce({});

      await service.submit('a1', 'tenant-a', 'user-1');

      expect(prisma.assessmentHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ version: 1 }) }),
      );
    });
  });
});
