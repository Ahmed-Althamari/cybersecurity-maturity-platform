import { ConflictException, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { UsersService } from './users.service';

describe('UsersService', () => {
  let usersService: UsersService;
  let prisma: { user: any; userRoleAssignment: any };

  beforeEach(() => {
    prisma = {
      user: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
        update: jest.fn(),
      },
      userRoleAssignment: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    usersService = new UsersService(prisma as unknown as PrismaService);
  });

  describe('tenant isolation', () => {
    it('scopes findOne lookups to the requesting tenant', async () => {
      prisma.user.findFirst.mockResolvedValueOnce(null);

      await expect(usersService.findOne('user-in-tenant-a', 'tenant-b')).rejects.toThrow(
        NotFoundException,
      );

      expect(prisma.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-in-tenant-a', tenantId: 'tenant-b', deletedAt: null },
        }),
      );
    });

    it('scopes findAll to the requesting tenant only', async () => {
      prisma.user.findMany.mockResolvedValueOnce([]);
      await usersService.findAll('tenant-a');

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: 'tenant-a', deletedAt: null } }),
      );
      expect(prisma.user.count).toHaveBeenCalledWith({ where: { tenantId: 'tenant-a', deletedAt: null } });
    });
  });

  describe('findAll pagination', () => {
    it('returns a PaginatedResponse shape, capping page size and computing totalPages', async () => {
      prisma.user.count.mockResolvedValueOnce(45);
      prisma.user.findMany.mockResolvedValueOnce([{ id: 'u1' }, { id: 'u2' }]);

      const result = await usersService.findAll('tenant-a', { page: 2, pageSize: 20 });

      expect(result).toEqual({
        data: [{ id: 'u1' }, { id: 'u2' }],
        total: 45,
        page: 2,
        pageSize: 20,
        totalPages: 3,
      });
      expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 20, take: 20 }));
    });
  });

  describe('create', () => {
    it('hashes the password and never stores it in plaintext', async () => {
      prisma.user.findFirst.mockResolvedValueOnce(null);
      prisma.user.create.mockImplementationOnce(({ data }: any) =>
        Promise.resolve({ id: 'new-user', ...data }),
      );

      await usersService.create('tenant-a', {
        email: 'new@example.local',
        name: 'New User',
        password: 'SuperSecretPassword1!',
      });

      const createArgs = prisma.user.create.mock.calls[0][0];
      expect(createArgs.data.passwordHash).toBeDefined();
      expect(createArgs.data.passwordHash).not.toBe('SuperSecretPassword1!');
      expect(createArgs.data).not.toHaveProperty('password');
    });

    it('rejects duplicate emails within the same tenant', async () => {
      prisma.user.findFirst.mockResolvedValueOnce({ id: 'existing-user' });

      await expect(
        usersService.create('tenant-a', {
          email: 'duplicate@example.local',
          name: 'Duplicate',
          password: 'SuperSecretPassword1!',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });
});
