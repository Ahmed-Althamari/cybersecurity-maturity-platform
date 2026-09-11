import type { AuditAction } from '@cmmp/database';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import type { QueryAuditEventsDto } from './dto/query-audit-events.dto';

export interface RecordAuditEventInput {
  tenantId: string;
  userId: string;
  action: AuditAction;
  resource: string;
  resourceId?: string;
  description?: string;
  previousValue?: string;
  newValue?: string;
  ipAddress?: string;
  userAgent?: string;
  correlationId?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Append-only write: the audit trail must never be blamed for breaking
   * the request it's describing, so a failure here is logged and
   * swallowed rather than propagated. There is deliberately no update/
   * delete method on this service — AuditEvent rows are immutable once
   * written.
   */
  async record(input: RecordAuditEventInput): Promise<void> {
    try {
      await this.prisma.auditEvent.create({ data: input });
    } catch (error) {
      this.logger.error(`Failed to record audit event (${input.resource}/${input.action}): ${(error as Error).message}`);
    }
  }

  async findAll(tenantId: string, filters: QueryAuditEventsDto = {}) {
    const { userId, action, resource, resourceId, from, to, limit = 50, offset = 0 } = filters;

    const where = {
      tenantId,
      userId,
      action,
      resource,
      resourceId,
      createdAt: from || to ? { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined } : undefined,
    };

    const [data, total] = await Promise.all([
      this.prisma.auditEvent.findMany({
        where,
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.auditEvent.count({ where }),
    ]);

    return { data, total };
  }

  async findOne(id: string, tenantId: string) {
    const event = await this.prisma.auditEvent.findFirst({
      where: { id, tenantId },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    if (!event) {
      throw new NotFoundException('Audit event not found');
    }
    return event;
  }
}
