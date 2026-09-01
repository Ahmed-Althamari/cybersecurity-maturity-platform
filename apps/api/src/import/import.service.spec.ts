import { BadRequestException } from '@nestjs/common';
import { ImportService } from './import.service';
import { PrismaService } from '../prisma/prisma.service';
import { AssessmentsService } from '../assessments/assessments.service';

const mapping = {
  subcategoryCode: 'Code',
  currentMaturity: 'Current',
  rationale: 'Notes',
};

function csvFile(content: string) {
  return { buffer: Buffer.from(content, 'utf-8'), originalname: 'import.csv', size: content.length };
}

describe('ImportService', () => {
  let service: ImportService;
  let prisma: {
    assessmentItem: { findMany: jest.Mock; update: jest.Mock };
    importJob: { create: jest.Mock; update: jest.Mock };
    importRecord: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let assessmentsService: { requireEditable: jest.Mock; recalculateProgress: jest.Mock };

  beforeEach(() => {
    prisma = {
      assessmentItem: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'item-1', question: { subcategory: { code: 'GV.RM-01' } } },
          { id: 'item-2', question: { subcategory: { code: 'GV.RM-02' } } },
        ]),
        update: jest.fn(),
      },
      importJob: {
        create: jest.fn().mockResolvedValue({ id: 'job-1' }),
        update: jest.fn(),
      },
      importRecord: { create: jest.fn() },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    };
    assessmentsService = {
      requireEditable: jest.fn().mockResolvedValue({ id: 'assessment-1', organisationId: 'org-1' }),
      recalculateProgress: jest.fn(),
    };

    service = new ImportService(
      prisma as unknown as PrismaService,
      assessmentsService as unknown as AssessmentsService,
    );
  });

  it('checks the assessment is editable before parsing anything', async () => {
    assessmentsService.requireEditable.mockRejectedValueOnce(new BadRequestException('nope'));

    await expect(
      service.importAssessmentResponses(
        'tenant-a',
        'user-1',
        'assessment-1',
        csvFile('Code,Current\nGV.RM-01,DEFINED\n'),
        'csv',
        mapping,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.importJob.create).not.toHaveBeenCalled();
  });

  it('rejects a mapping with no subcategoryCode column', async () => {
    await expect(
      service.importAssessmentResponses(
        'tenant-a',
        'user-1',
        'assessment-1',
        csvFile('Current\nDEFINED\n'),
        'csv',
        { currentMaturity: 'Current' },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('wraps a spreadsheet parse failure in a BadRequestException', async () => {
    await expect(
      service.importAssessmentResponses(
        'tenant-a',
        'user-1',
        'assessment-1',
        { buffer: Buffer.from('not a real workbook'), originalname: 'bad.xlsx', size: 20 },
        'xlsx',
        mapping,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('applies valid rows to their matching AssessmentItem inside one transaction', async () => {
    const result = await service.importAssessmentResponses(
      'tenant-a',
      'user-1',
      'assessment-1',
      csvFile('Code,Current,Notes\nGV.RM-01,DEFINED,ok\nGV.RM-02,MANAGED,also ok\n'),
      'csv',
      mapping,
    );

    expect(result.successCount).toBe(2);
    expect(result.errorCount).toBe(0);
    expect(prisma.assessmentItem.update).toHaveBeenCalledTimes(2);
    expect(prisma.assessmentItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'item-1' },
        data: expect.objectContaining({ currentMaturity: 'DEFINED', rationale: 'ok' }),
      }),
    );
    expect(prisma.importRecord.create).toHaveBeenCalledTimes(2);
    expect(prisma.importJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'COMPLETED', successCount: 2, errorCount: 0 }),
      }),
    );
    expect(assessmentsService.recalculateProgress).toHaveBeenCalledWith('assessment-1', 'user-1');
  });

  it('errors a row whose subcategory code has no matching item in this assessment, without touching other rows', async () => {
    const result = await service.importAssessmentResponses(
      'tenant-a',
      'user-1',
      'assessment-1',
      csvFile('Code,Current\nGV.RM-01,DEFINED\nUNKNOWN-CODE,DEFINED\n'),
      'csv',
      mapping,
    );

    expect(result.successCount).toBe(1);
    expect(result.errorCount).toBe(1);
    expect(prisma.assessmentItem.update).toHaveBeenCalledTimes(1);
    const errorRow = result.results.find((r) => r.status === 'ERROR');
    expect(errorRow?.messages[0]).toMatch(/UNKNOWN-CODE/);
  });

  it('counts formula-injection-sanitized rows as WARNING, still applied, and neutralizes the payload', async () => {
    const result = await service.importAssessmentResponses(
      'tenant-a',
      'user-1',
      'assessment-1',
      csvFile('Code,Current,Notes\nGV.RM-01,DEFINED,=cmd|\' /C calc\'!A1\n'),
      'csv',
      mapping,
    );

    expect(result.successCount).toBe(1);
    expect(result.warningCount).toBe(1);
    expect(prisma.assessmentItem.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ rationale: expect.stringMatching(/^'=/) }) }),
    );
  });

  it('creates an audit-trail ImportRecord even for error rows, and records the errorReport JSON', async () => {
    await service.importAssessmentResponses(
      'tenant-a',
      'user-1',
      'assessment-1',
      csvFile('Code,Current\n,DEFINED\n'),
      'csv',
      mapping,
    );

    expect(prisma.importRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'ERROR' }) }),
    );
    const jobUpdateArgs = prisma.importJob.update.mock.calls[0][0];
    expect(jobUpdateArgs.data.errorReport).toContain('subcategoryCode');
  });

  it('does not recalculate progress when nothing was successfully applied', async () => {
    await service.importAssessmentResponses(
      'tenant-a',
      'user-1',
      'assessment-1',
      csvFile('Code,Current\n,DEFINED\n'),
      'csv',
      mapping,
    );

    expect(assessmentsService.recalculateProgress).not.toHaveBeenCalled();
  });
});
