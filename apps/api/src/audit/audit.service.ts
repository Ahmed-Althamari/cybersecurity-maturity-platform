import { Injectable, Logger } from '@nestjs/common';
import { AuditAction } from '@cmmp/shared';
import { PrismaService } from '../prisma/prisma.service';

// Serialized response bodies can be large (e.g. a freshly-created
// Framework's full nested tree) -- capped so one mutation can't bloat the
// audit trail disproportionately. Still enough to see what changed on the
// vast majority of create/update responses.
const MAX_VALUE_LENGTH = 5000;

export interface LogAuditEventInput {
  tenantId: string;
  userId: string;
  action: AuditAction;
  resource: string;
  resourceId?: string | null;
  description?: string;
  previousValue?: unknown;
  newValue?: unknown;
  ipAddress?: string;
  userAgent?: string;
  correlationId?: string;
}

export interface FindAllAuditEventsFilters {
  userId?: string;
  action?: AuditAction;
  resource?: string;
  resourceId?: string;
  correlationId?: string;
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
}

function serializeForAudit(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const json = JSON.stringify(value);
  return json.length > MAX_VALUE_LENGTH ? `${json.slice(0, MAX_VALUE_LENGTH)}…(truncated)` : json;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger('AuditService');

  constructor(private prisma: PrismaService) {}

  /**
   * The only write path onto AuditEvent -- there is deliberately no
   * update()/delete() anywhere in this service, and no PATCH/DELETE route
   * on AuditController, so nothing in the application can alter or erase
   * an existing entry (the immutable audit trail requirement). This is an
   * application-level guarantee, not a database-enforced one (e.g. via a
   * Postgres rule/trigger denying UPDATE/DELETE on the table) -- a real
   * production hardening pass should add that belt-and-suspenders layer
   * too.
   */
  async log(input: LogAuditEventInput): Promise<void> {
    try {
      await this.prisma.auditEvent.create({
        data: {
          tenantId: input.tenantId,
          userId: input.userId,
          action: input.action,
          resource: input.resource,
          resourceId: input.resourceId ?? null,
          description: input.description,
          previousValue: serializeForAudit(input.previousValue),
          newValue: serializeForAudit(input.newValue),
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
          correlationId: input.correlationId,
        },
      });
    } catch (error) {
      // Audit logging must never break the request it's describing --
      // log-and-continue rather than propagate.
      this.logger.error('Failed to write audit event', error as Error);
    }
  }

  async findAll(tenantId: string, filters: FindAllAuditEventsFilters = {}) {
    const page = filters.page && filters.page > 0 ? filters.page : 1;
    const pageSize = filters.pageSize && filters.pageSize > 0 ? Math.min(filters.pageSize, 200) : 50;

    const where = {
      tenantId,
      userId: filters.userId,
      action: filters.action,
      resource: filters.resource,
      resourceId: filters.resourceId,
      correlationId: filters.correlationId,
      createdAt:
        filters.from || filters.to
          ? { gte: filters.from, lte: filters.to }
          : undefined,
    };

    const [total, data] = await Promise.all([
      this.prisma.auditEvent.count({ where }),
      this.prisma.auditEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  /** Powers the audit dashboard: rollup counts plus the most recent events, over a trailing window. */
  async getSummary(tenantId: string, sinceDays = 30) {
    const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
    const where = { tenantId, createdAt: { gte: since } };

    const [totalEvents, byActionRaw, byResourceRaw, recentEvents] = await Promise.all([
      this.prisma.auditEvent.count({ where }),
      this.prisma.auditEvent.groupBy({ by: ['action'], where, _count: { action: true } }),
      this.prisma.auditEvent.groupBy({ by: ['resource'], where, _count: { resource: true } }),
      this.prisma.auditEvent.findMany({ where, orderBy: { createdAt: 'desc' }, take: 20 }),
    ]);

    const byAction = Object.fromEntries(Object.values(AuditAction).map((action) => [action, 0])) as Record<
      AuditAction,
      number
    >;
    for (const row of byActionRaw) {
      byAction[row.action as AuditAction] = row._count.action;
    }

    const byResource: Record<string, number> = {};
    for (const row of byResourceRaw) {
      byResource[row.resource] = row._count.resource;
    }

    return { totalEvents, byAction, byResource, recentEvents };
  }
}
