import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';
import { PrismaService } from '../prisma/prisma.service';

describe('HealthController', () => {
  let controller: HealthController;
  let prisma: { $queryRaw: jest.Mock };

  beforeEach(() => {
    prisma = { $queryRaw: jest.fn() };
    controller = new HealthController(prisma as unknown as PrismaService);
  });

  it('reports ok when the database responds', async () => {
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    const result = await controller.check();
    expect(result.status).toBe('ok');
    expect(result.database).toBe('connected');
  });

  it('throws 503 when the database is unreachable', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('connection refused'));
    await expect(controller.check()).rejects.toThrow(ServiceUnavailableException);
  });
});
