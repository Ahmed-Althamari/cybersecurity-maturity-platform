import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { PrismaService } from '../prisma/prisma.service';

/**
 * A RevokedToken row only needs to exist until its own `expiresAt` — past that point the token
 * it represents would already be rejected on expiry alone by JwtStrategy, so the row is pure
 * dead weight. Nothing prunes them otherwise, so the table grows without bound (documented as a
 * known gap in docs/security-architecture.md until this).
 */
@Injectable()
export class RevokedTokenCleanupService {
  private readonly logger = new Logger(RevokedTokenCleanupService.name);

  constructor(private prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async pruneExpired(): Promise<number> {
    const { count } = await this.prisma.revokedToken.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    if (count > 0) {
      this.logger.log(`Pruned ${count} expired revoked-token row(s).`);
    }
    return count;
  }
}
