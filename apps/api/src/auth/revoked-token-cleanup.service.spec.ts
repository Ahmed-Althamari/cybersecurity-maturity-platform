import { PrismaService } from '../prisma/prisma.service';

import { RevokedTokenCleanupService } from './revoked-token-cleanup.service';

describe('RevokedTokenCleanupService', () => {
  let service: RevokedTokenCleanupService;
  let prisma: { revokedToken: { deleteMany: jest.Mock } };

  beforeEach(() => {
    prisma = { revokedToken: { deleteMany: jest.fn() } };
    service = new RevokedTokenCleanupService(prisma as unknown as PrismaService);
  });

  it('deletes only rows whose expiresAt has already passed', async () => {
    prisma.revokedToken.deleteMany.mockResolvedValue({ count: 3 });

    const result = await service.pruneExpired();

    expect(prisma.revokedToken.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: expect.any(Date) } },
    });
    expect(result).toBe(3);
  });

  it('returns 0 without erroring when nothing is expired yet', async () => {
    prisma.revokedToken.deleteMany.mockResolvedValue({ count: 0 });

    await expect(service.pruneExpired()).resolves.toBe(0);
  });
});
