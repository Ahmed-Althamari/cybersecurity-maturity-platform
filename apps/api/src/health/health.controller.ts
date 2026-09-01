import { Controller, Get, HttpCode, HttpStatus, ServiceUnavailableException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

/**
 * Unauthenticated by design (excluded from the global `api/v1` prefix in
 * main.ts) -- container orchestrators (Docker HEALTHCHECK, k8s probes, load
 * balancers) hit this without a token.
 */
@Controller('health')
export class HealthController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (error) {
      throw new ServiceUnavailableException({
        status: 'error',
        database: 'unreachable',
        message: error instanceof Error ? error.message : 'Unknown database error',
      });
    }

    return { status: 'ok', database: 'connected', timestamp: new Date().toISOString() };
  }
}
