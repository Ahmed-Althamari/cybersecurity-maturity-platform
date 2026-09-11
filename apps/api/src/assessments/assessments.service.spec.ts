import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { AssessmentsService, parseColumnMappingOverride } from './assessments.service';
import type { ImportMappingSuggesterService } from './import-mapping/mapping-suggester.service';

type MockModel = Record<string, jest.Mock>;

const scoreableFramework = {
  slug: 'test-fw',
  name: 'Test Framework',
  version: '1.0',
  frameWorkType: 'TEST',
  description: null,
  isActive: true,
  functions: [
    {
      code: 'GV',
      name: 'Govern',
      description: null,
      displayOrder: 0,
      categories: [
        {
          code: 'GV.RM',
          name: 'Risk Management',
          description: null,
          displayOrder: 0,
          subcategories: [{ code: 'GV.RM-01', name: 'Objective one', description: null, displayOrder: 0 }],
        },
      ],
    },
  ],
};

describe('AssessmentsService', () => {
  let service: AssessmentsService;
  let mappingSuggester: { suggestMapping: jest.Mock };
  let prisma: {
    organisation: MockModel;
    framework: MockModel;
    assessmentTemplate: MockModel;
    assessment: MockModel;
    assessmentQuestion: MockModel;
    assessmentItem: MockModel;
    assessmentHistory: MockModel;
    $transaction: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      organisation: { findFirst: jest.fn() },
      framework: { findFirst: jest.fn() },
      assessmentTemplate: { findFirst: jest.fn(), create: jest.fn() },
      assessment: { create: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
      assessmentQuestion: { findFirst: jest.fn(), count: jest.fn(), findMany: jest.fn() },
      assessmentItem: { upsert: jest.fn(), count: jest.fn(), findMany: jest.fn() },
      assessmentHistory: { findFirst: jest.fn(), create: jest.fn() },
      $transaction: jest.fn((operations: unknown[]) => Promise.all(operations)),
    };

    mappingSuggester = { suggestMapping: jest.fn().mockResolvedValue({ mapping: {}, configured: false }) };
    service = new AssessmentsService(prisma as unknown as PrismaService, mappingSuggester as unknown as ImportMappingSuggesterService);
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

    it('marks the assessment SUBMITTED, computes overall scores, and appends a versioned history entry', async () => {
      prisma.assessment.findFirst.mockResolvedValueOnce({
        id: 'a1',
        status: 'IN_PROGRESS',
        items: [{ id: 'i1' }],
        template: { frameworkId: 'fw-a' },
      });
      prisma.framework.findFirst.mockResolvedValueOnce(scoreableFramework);
      prisma.assessmentItem.findMany.mockResolvedValueOnce([
        { currentMaturity: 'DEVELOPING', targetMaturity: 'MANAGED', weight: 1, question: { subcategory: { code: 'GV.RM-01' } } },
      ]);
      prisma.assessment.update.mockResolvedValueOnce({
        id: 'a1',
        status: 'SUBMITTED',
        currentMaturity: 2,
        targetMaturity: 4,
      });
      prisma.assessmentHistory.findFirst.mockResolvedValueOnce({ version: 2 });
      prisma.assessmentHistory.create.mockResolvedValueOnce({});

      await service.submit('a1', 'tenant-a', 'user-1');

      expect(prisma.assessment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'SUBMITTED', currentMaturity: 2, targetMaturity: 4, maturityGap: 2 }),
        }),
      );
      expect(prisma.assessmentHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ assessmentId: 'a1', version: 3, status: 'SUBMITTED' }) }),
      );
    });

    it('persists null scores when nothing scored is applicable', async () => {
      prisma.assessment.findFirst.mockResolvedValueOnce({
        id: 'a1',
        status: 'IN_PROGRESS',
        items: [{ id: 'i1' }],
        template: { frameworkId: 'fw-a' },
      });
      prisma.framework.findFirst.mockResolvedValueOnce(scoreableFramework);
      prisma.assessmentItem.findMany.mockResolvedValueOnce([
        { currentMaturity: 'NOT_APPLICABLE', targetMaturity: 'MANAGED', weight: 1, question: { subcategory: { code: 'GV.RM-01' } } },
      ]);
      prisma.assessment.update.mockResolvedValueOnce({ id: 'a1', status: 'SUBMITTED' });
      prisma.assessmentHistory.findFirst.mockResolvedValueOnce(null);
      prisma.assessmentHistory.create.mockResolvedValueOnce({});

      await service.submit('a1', 'tenant-a', 'user-1');

      expect(prisma.assessment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ currentMaturity: null, targetMaturity: null, maturityGap: null }),
        }),
      );
    });

    it('starts history versioning at 1 when none exists yet', async () => {
      prisma.assessment.findFirst.mockResolvedValueOnce({
        id: 'a1',
        status: 'IN_PROGRESS',
        items: [{ id: 'i1' }],
        template: { frameworkId: 'fw-a' },
      });
      prisma.framework.findFirst.mockResolvedValueOnce(scoreableFramework);
      prisma.assessmentItem.findMany.mockResolvedValueOnce([]);
      prisma.assessment.update.mockResolvedValueOnce({ id: 'a1', status: 'SUBMITTED' });
      prisma.assessmentHistory.findFirst.mockResolvedValueOnce(null);
      prisma.assessmentHistory.create.mockResolvedValueOnce({});

      await service.submit('a1', 'tenant-a', 'user-1');

      expect(prisma.assessmentHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ version: 1 }) }),
      );
    });
  });

  describe('getResults', () => {
    it('rejects an assessment with no template', async () => {
      prisma.assessment.findFirst.mockResolvedValueOnce({ id: 'a1', template: null });

      await expect(service.getResults('a1', 'tenant-a')).rejects.toThrow(ConflictException);
    });

    it('returns the overall and per-function scores', async () => {
      prisma.assessment.findFirst.mockResolvedValueOnce({
        id: 'a1',
        status: 'IN_PROGRESS',
        completionPercentage: 50,
        template: { frameworkId: 'fw-a' },
      });
      prisma.framework.findFirst.mockResolvedValueOnce(scoreableFramework);
      prisma.assessmentItem.findMany.mockResolvedValueOnce([
        { currentMaturity: 'OPTIMISED', targetMaturity: 'OPTIMISED', weight: 1, question: { subcategory: { code: 'GV.RM-01' } } },
      ]);

      const results = await service.getResults('a1', 'tenant-a');

      expect(results.overall.current).toBe(5);
      expect(results.functions[0].code).toBe('GV');
      expect(results.completionPercentage).toBe(50);
    });
  });

  describe('getGaps', () => {
    it('returns a prioritised list of gaps from the scored tree', async () => {
      prisma.assessment.findFirst.mockResolvedValueOnce({ id: 'a1', template: { frameworkId: 'fw-a' } });
      prisma.framework.findFirst.mockResolvedValueOnce(scoreableFramework);
      prisma.assessmentItem.findMany.mockResolvedValueOnce([
        { currentMaturity: 'INITIAL', targetMaturity: 'MANAGED', weight: 1, question: { subcategory: { code: 'GV.RM-01' } } },
      ]);

      const gaps = await service.getGaps('a1', 'tenant-a', { depth: 2 });

      expect(gaps).toEqual([expect.objectContaining({ code: 'GV.RM-01', gap: 3 })]);
    });
  });

  describe('importFile', () => {
    function csvFile(content: string): Express.Multer.File {
      const buffer = Buffer.from(content, 'utf-8');
      return {
        originalname: 'assessment.csv',
        mimetype: 'text/csv',
        size: buffer.length,
        buffer,
      } as Express.Multer.File;
    }

    const baseAssessment = { id: 'a1', status: 'DRAFT', template: { frameworkId: 'fw-a' } };

    it('rejects once the assessment is no longer editable', async () => {
      prisma.assessment.findFirst.mockResolvedValueOnce({ ...baseAssessment, status: 'SUBMITTED' });

      await expect(service.importFile('a1', 'tenant-a', 'user-1', csvFile('Control_ID\nGV.RM-01'))).rejects.toThrow(
        ConflictException,
      );
    });

    it('rejects an oversized/invalid file before parsing', async () => {
      prisma.assessment.findFirst.mockResolvedValueOnce(baseAssessment);
      const file = csvFile('Control_ID\nGV.RM-01');
      file.originalname = 'assessment.exe';

      await expect(service.importFile('a1', 'tenant-a', 'user-1', file)).rejects.toThrow(BadRequestException);
      expect(prisma.assessmentQuestion.findMany).not.toHaveBeenCalled();
    });

    it('imports rows whose Control_ID matches a real subcategory, and reports everything else', async () => {
      prisma.assessment.findFirst.mockResolvedValueOnce(baseAssessment);
      prisma.assessmentQuestion.findMany.mockResolvedValueOnce([{ id: 'question-1', subcategory: { code: 'GV.RM-01' } }]);
      prisma.assessmentQuestion.count.mockResolvedValueOnce(1);
      prisma.assessmentItem.count.mockResolvedValueOnce(1);

      const csv = [
        'Control_ID,Current_Maturity',
        'GV.RM-01,DEVELOPING', // matches -> imported
        'GV.UNKNOWN-99,DEVELOPING', // valid shape, but no matching subcategory
        ',DEVELOPING', // invalid on its own (no Control_ID)
      ].join('\n');

      const result = await service.importFile('a1', 'tenant-a', 'user-1', csvFile(csv));

      expect(result.importedCount).toBe(1);
      expect(result.validCount).toBe(2);
      expect(result.invalidCount).toBe(2); // the missing-Control_ID row + the unmatched-Control_ID row
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.assessment.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'IN_PROGRESS' }) }),
      );
      expect(result.errorReportCsv).toContain('GV.UNKNOWN-99');
    });

    it('does not touch the database when nothing in the file matches', async () => {
      prisma.assessment.findFirst.mockResolvedValueOnce(baseAssessment);
      prisma.assessmentQuestion.findMany.mockResolvedValueOnce([]);

      const result = await service.importFile('a1', 'tenant-a', 'user-1', csvFile('Control_ID,Current_Maturity\nGV.UNKNOWN,DEVELOPING'));

      expect(result.importedCount).toBe(0);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.assessment.update).not.toHaveBeenCalled();
    });

    it('still imports a row that only has a warning (e.g. a sanitised formula cell), not just clean valid rows', async () => {
      prisma.assessment.findFirst.mockResolvedValueOnce(baseAssessment);
      prisma.assessmentQuestion.findMany.mockResolvedValueOnce([{ id: 'question-1', subcategory: { code: 'GV.RM-01' } }]);
      prisma.assessmentQuestion.count.mockResolvedValueOnce(1);
      prisma.assessmentItem.count.mockResolvedValueOnce(1);

      const csv = ['Control_ID,Current_Maturity,Comments', 'GV.RM-01,DEVELOPING,"=cmd|\'/c calc\'!A1"'].join('\n');

      const result = await service.importFile('a1', 'tenant-a', 'user-1', csvFile(csv));

      expect(result.importedCount).toBe(1);
      expect(result.warningCount).toBe(1);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      const upsertCall = prisma.assessmentItem.upsert.mock.calls[0][0];
      expect(upsertCall.create.currentMaturity).toBe('DEVELOPING');
    });

    it('moves a warning row that turns out unmatched into invalid, not double-counted as both', async () => {
      prisma.assessment.findFirst.mockResolvedValueOnce(baseAssessment);
      prisma.assessmentQuestion.findMany.mockResolvedValueOnce([]); // nothing matches

      const csv = ['Control_ID,Comments', 'GV.UNKNOWN,"=cmd|\'/c calc\'!A1"'].join('\n');

      const result = await service.importFile('a1', 'tenant-a', 'user-1', csvFile(csv));

      expect(result.importedCount).toBe(0);
      expect(result.warningCount).toBe(0);
      expect(result.invalidCount).toBe(1);
    });

    it('accepts a caller-supplied columnMapping override for a header autoMapColumns would not have recognised', async () => {
      prisma.assessment.findFirst.mockResolvedValueOnce(baseAssessment);
      prisma.assessmentQuestion.findMany.mockResolvedValueOnce([{ id: 'question-1', subcategory: { code: 'GV.RM-01' } }]);
      prisma.assessmentQuestion.count.mockResolvedValueOnce(1);
      prisma.assessmentItem.count.mockResolvedValueOnce(1);

      const csv = ['Control_ID,Maturity Score (Now)', 'GV.RM-01,DEVELOPING'].join('\n');

      const result = await service.importFile('a1', 'tenant-a', 'user-1', csvFile(csv), undefined, {
        Current_Maturity: 'Maturity Score (Now)',
      });

      expect(result.importedCount).toBe(1);
      expect(result.columnMapping.Current_Maturity).toBe('Maturity Score (Now)');
    });
  });

  describe('previewImport', () => {
    function csvFile(content: string): Express.Multer.File {
      const buffer = Buffer.from(content, 'utf-8');
      return { originalname: 'assessment.csv', mimetype: 'text/csv', size: buffer.length, buffer } as Express.Multer.File;
    }

    const baseAssessment = { id: 'a1', status: 'DRAFT', template: { frameworkId: 'fw-a' } };

    it('never writes to the database', async () => {
      prisma.assessment.findFirst.mockResolvedValueOnce(baseAssessment);

      await service.previewImport('a1', 'tenant-a', csvFile('Control_ID,Current_Maturity\nGV.RM-01,DEVELOPING'));

      expect(prisma.assessmentItem.upsert).not.toHaveBeenCalled();
      expect(prisma.assessment.update).not.toHaveBeenCalled();
    });

    it('reports the LLM as unconfigured and skips calling it when nothing is unmapped', async () => {
      prisma.assessment.findFirst.mockResolvedValueOnce(baseAssessment);
      mappingSuggester.suggestMapping.mockResolvedValueOnce({ mapping: {}, configured: false });

      const result = await service.previewImport('a1', 'tenant-a', csvFile('Control_ID,Current_Maturity\nGV.RM-01,DEVELOPING'));

      expect(result.llmConfigured).toBe(false);
      expect(result.llmSuggestedColumns).toEqual([]);
      expect(result.unmappedColumns).not.toContain('Control_ID');
    });

    it('merges an LLM-suggested mapping into the final result when one is returned', async () => {
      prisma.assessment.findFirst.mockResolvedValueOnce(baseAssessment);
      mappingSuggester.suggestMapping.mockResolvedValueOnce({
        mapping: { Current_Maturity: 'Maturity Score (Now)' },
        configured: true,
      });

      const result = await service.previewImport('a1', 'tenant-a', csvFile('Control_ID,Maturity Score (Now)\nGV.RM-01,DEVELOPING'));

      expect(result.llmConfigured).toBe(true);
      expect(result.llmSuggestedColumns).toEqual(['Current_Maturity']);
      expect(result.columnMapping.Current_Maturity).toBe('Maturity Score (Now)');
      expect(result.unmappedColumns).not.toContain('Current_Maturity');
    });

    it('passes the tenant id through to the mapping suggester', async () => {
      prisma.assessment.findFirst.mockResolvedValueOnce(baseAssessment);

      await service.previewImport('a1', 'tenant-a', csvFile('Control_ID,Current_Maturity\nGV.RM-01,DEVELOPING'));

      expect(mappingSuggester.suggestMapping).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(Array),
        expect.any(Array),
        'tenant-a',
      );
    });
  });
});

describe('parseColumnMappingOverride', () => {
  it('returns undefined for an absent override', () => {
    expect(parseColumnMappingOverride(undefined)).toBeUndefined();
  });

  it('parses a valid override', () => {
    expect(parseColumnMappingOverride('{"Current_Maturity": "Score"}')).toEqual({ Current_Maturity: 'Score' });
  });

  it('rejects invalid JSON', () => {
    expect(() => parseColumnMappingOverride('not json')).toThrow(BadRequestException);
  });

  it('rejects a JSON array', () => {
    expect(() => parseColumnMappingOverride('[]')).toThrow(BadRequestException);
  });

  it('rejects an unknown canonical column', () => {
    expect(() => parseColumnMappingOverride('{"Not_A_Real_Column": "X"}')).toThrow(BadRequestException);
  });

  it('rejects a non-string value', () => {
    expect(() => parseColumnMappingOverride('{"Current_Maturity": 5}')).toThrow(BadRequestException);
  });
});
