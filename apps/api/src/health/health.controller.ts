import { Controller, Get, HttpCode, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';

import { PrismaService } from '../prisma/prisma.service';

/**
 * Unauthenticated by design — container orchestrators and load balancers
 * probe this without a JWT. Deliberately excluded from the global
 * `api/v1` prefix (see main.ts) so it stays reachable at a stable path
 * regardless of API versioning, and it carries no @AuditLog since a
 * probe hitting it every few seconds isn't a user action worth an audit
 * trail entry. @SkipThrottle for the same reason — a health probe
 * running every few seconds would otherwise burn through the global
 * rate limit on its own.
 */
@ApiTags('Health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @HttpCode(200)
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({ status: 'error', database: 'down' });
    }
    return { status: 'ok', database: 'up' };
  }
}
