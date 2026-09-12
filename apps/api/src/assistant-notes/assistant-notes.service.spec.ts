import { NotFoundException } from '@nestjs/common';

import type { PrismaService } from '../prisma/prisma.service';

import { AssistantNotesService } from './assistant-notes.service';

type MockModel = Record<string, jest.Mock>;

const TENANT_ID = 'tenant-1';
const ORG_ID = 'org-1';
const USER_ID = 'user-1';

describe('AssistantNotesService', () => {
  let service: AssistantNotesService;
  let prisma: { assistantNote: MockModel; organisation: MockModel };

  beforeEach(() => {
    prisma = {
      assistantNote: { findMany: jest.fn(), create: jest.fn(), deleteMany: jest.fn() },
      organisation: { findFirst: jest.fn() },
    };
    service = new AssistantNotesService(prisma as unknown as PrismaService);
  });

  describe('findAllForOrganisation', () => {
    it('scopes to the tenant and organisation, newest first', async () => {
      prisma.assistantNote.findMany.mockResolvedValue([{ id: 'note-1' }]);

      const result = await service.findAllForOrganisation(TENANT_ID, ORG_ID);

      expect(result).toEqual([{ id: 'note-1' }]);
      expect(prisma.assistantNote.findMany).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID, organisationId: ORG_ID },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('create', () => {
    it('throws NotFoundException when the organisation does not belong to this tenant', async () => {
      prisma.organisation.findFirst.mockResolvedValue(null);

      await expect(service.create(TENANT_ID, USER_ID, { organisationId: ORG_ID, content: 'Vendor risk is high priority' })).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.assistantNote.create).not.toHaveBeenCalled();
    });

    it('creates a note scoped to the tenant, with the creating user recorded', async () => {
      prisma.organisation.findFirst.mockResolvedValue({ id: ORG_ID });
      prisma.assistantNote.create.mockResolvedValue({ id: 'note-1' });

      const result = await service.create(TENANT_ID, USER_ID, { organisationId: ORG_ID, content: 'Board review is first Monday of the quarter' });

      expect(result).toEqual({ id: 'note-1' });
      expect(prisma.assistantNote.create).toHaveBeenCalledWith({
        data: {
          tenantId: TENANT_ID,
          organisationId: ORG_ID,
          content: 'Board review is first Monday of the quarter',
          createdById: USER_ID,
        },
      });
    });
  });

  describe('remove', () => {
    it('throws NotFoundException when nothing matched the tenant-scoped delete', async () => {
      prisma.assistantNote.deleteMany.mockResolvedValue({ count: 0 });
      await expect(service.remove(TENANT_ID, 'note-1')).rejects.toThrow(NotFoundException);
    });

    it('succeeds when a row was deleted', async () => {
      prisma.assistantNote.deleteMany.mockResolvedValue({ count: 1 });
      await expect(service.remove(TENANT_ID, 'note-1')).resolves.toBeUndefined();
      expect(prisma.assistantNote.deleteMany).toHaveBeenCalledWith({ where: { id: 'note-1', tenantId: TENANT_ID } });
    });
  });
});
