import { Prisma } from '@cmmp/database';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { CreateMilestoneDto } from './dto/create-milestone.dto';
import { CreateStrategicInitiativeDto } from './dto/create-strategic-initiative.dto';
import { RecordProgressDto } from './dto/record-progress.dto';
import { UpdateMilestoneDto } from './dto/update-milestone.dto';
import { UpdateStrategicInitiativeDto } from './dto/update-strategic-initiative.dto';

const TERMINAL_STATUSES = ['COMPLETED', 'CANCELLED'];
const HIGH_RISK_LEVELS = ['CRITICAL', 'HIGH'];

const initiativeDetailInclude = {
  risks: { where: { deletedAt: null } },
  milestones: { orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }] },
  monthlyProgress: { orderBy: { month: 'asc' as const } },
};

/** Normalises a 'YYYY-MM' or 'YYYY-MM-DD' string (or a Date) to that month's first day at UTC midnight, so the same calendar month always produces the same key for the `[initiativeId, month]` unique constraint. */
export function toMonthKey(input: string | Date): Date {
  const date = typeof input === 'string' ? new Date(`${input.length === 7 ? `${input}-01` : input}T00:00:00.000Z`) : input;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function monthKeyString(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Linear interpolation of "where this initiative should be" between its start and target dates.
 * Returns null when either date is missing or the range is degenerate -- the caller treats that
 * initiative as having no planned baseline (excluded from planned-vs-actual, not scored as behind).
 */
export function plannedPercentAt(startDate: Date | null, targetDate: Date | null, at: Date): number | null {
  if (!startDate || !targetDate) return null;
  const start = startDate.getTime();
  const end = targetDate.getTime();
  if (end <= start) return null;
  const t = at.getTime();
  if (t <= start) return 0;
  if (t >= end) return 100;
  return ((t - start) / (end - start)) * 100;
}

/** Weighted mean of `percentComplete` across a set of initiatives -- degrades to a plain average when every `weight` is left at its default of 1. Empty input (or all-zero weight) reports 0% rather than dividing by zero. */
export function computeWeightedProgress(initiatives: { percentComplete: number; weight: number }[]): number {
  const totalWeight = initiatives.reduce((sum, i) => sum + i.weight, 0);
  if (totalWeight <= 0) return 0;
  const weightedSum = initiatives.reduce((sum, i) => sum + i.percentComplete * i.weight, 0);
  return Math.round((weightedSum / totalWeight) * 10) / 10;
}

function isOverdue(initiative: { status: string; targetDate: Date | null }, now: Date): boolean {
  return !TERMINAL_STATUSES.includes(initiative.status) && !!initiative.targetDate && initiative.targetDate < now;
}

/** "At risk" = either already overdue, or tracking more than 15 points behind its own straight-line planned pace -- a documented heuristic threshold, not derived from anything, so recalibrate freely. */
function isAtRisk(initiative: { status: string; startDate: Date | null; targetDate: Date | null; percentComplete: number }, now: Date): boolean {
  if (TERMINAL_STATUSES.includes(initiative.status)) return false;
  if (isOverdue(initiative, now)) return true;
  const planned = plannedPercentAt(initiative.startDate, initiative.targetDate, now);
  return planned !== null && planned - initiative.percentComplete > 15;
}

@Injectable()
export class StrategicInitiativesService {
  constructor(private prisma: PrismaService) {}

  /** Sequential per-organisation "INIT-005"-style code. Counts every row regardless of `deletedAt` (the unique index does too) and retries once on a races collision -- cheap insurance at this app's write volume, not a distributed sequence. */
  private async nextCode(organisationId: string): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const count = await this.prisma.strategicInitiative.count({ where: { organisationId } });
      const candidate = `INIT-${String(count + 1 + attempt).padStart(3, '0')}`;
      const exists = await this.prisma.strategicInitiative.findFirst({ where: { organisationId, code: candidate } });
      if (!exists) return candidate;
    }
    return `INIT-${Date.now()}`;
  }

  async create(tenantId: string, dto: CreateStrategicInitiativeDto) {
    const organisation = await this.prisma.organisation.findFirst({
      where: { id: dto.organisationId, tenantId, deletedAt: null },
    });
    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }

    if (dto.riskIds && dto.riskIds.length > 0) {
      const matchingRisks = await this.prisma.risk.count({
        where: { id: { in: dto.riskIds }, tenantId, organisationId: dto.organisationId, deletedAt: null },
      });
      if (matchingRisks !== dto.riskIds.length) {
        throw new BadRequestException('One or more riskIds do not belong to this organisation');
      }
    }

    const code = await this.nextCode(dto.organisationId);

    return this.prisma.strategicInitiative.create({
      data: {
        tenantId,
        organisationId: dto.organisationId,
        code,
        title: dto.title,
        description: dto.description,
        strategicObjective: dto.strategicObjective,
        owner: dto.owner,
        priority: dto.priority ?? 3,
        weight: dto.weight ?? 1,
        notes: dto.notes,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        targetDate: dto.targetDate ? new Date(dto.targetDate) : undefined,
        status: 'NOT_STARTED',
        risks: dto.riskIds && dto.riskIds.length > 0 ? { connect: dto.riskIds.map((id) => ({ id })) } : undefined,
      },
      include: initiativeDetailInclude,
    });
  }

  async findAll(
    tenantId: string,
    organisationId: string,
    options: {
      status?: string;
      owner?: string;
      strategicObjective?: string;
      priority?: number;
      riskLevel?: string;
      linked?: 'true' | 'false';
      year?: number;
      month?: number;
      search?: string;
      sort?: 'priority' | 'recent' | 'targetDate';
      page?: number;
      pageSize?: number;
    } = {},
  ) {
    const page = options.page && options.page > 0 ? Math.floor(options.page) : 1;
    const pageSize = options.pageSize && options.pageSize > 0 ? Math.min(Math.floor(options.pageSize), 100) : 20;

    let progressFilter: Prisma.StrategicInitiativeWhereInput | undefined;
    if (options.year) {
      const monthStart = options.month ? new Date(Date.UTC(options.year, options.month - 1, 1)) : new Date(Date.UTC(options.year, 0, 1));
      const monthEnd = options.month ? new Date(Date.UTC(options.year, options.month, 1)) : new Date(Date.UTC(options.year + 1, 0, 1));
      progressFilter = { monthlyProgress: { some: { month: { gte: monthStart, lt: monthEnd } } } };
    }

    const where: Prisma.StrategicInitiativeWhereInput = {
      tenantId,
      organisationId,
      deletedAt: null,
      status: options.status as Prisma.EnumStrategicInitiativeStatusFilter | undefined,
      priority: options.priority,
      ...(options.owner ? { owner: { contains: options.owner, mode: 'insensitive' } } : {}),
      ...(options.strategicObjective ? { strategicObjective: { contains: options.strategicObjective, mode: 'insensitive' } } : {}),
      ...(options.search ? { title: { contains: options.search, mode: 'insensitive' } } : {}),
      ...(options.linked === 'true' ? { risks: { some: {} } } : {}),
      ...(options.linked === 'false' ? { risks: { none: {} } } : {}),
      ...(options.riskLevel ? { risks: { some: { riskLevel: options.riskLevel as Prisma.EnumRiskLevelFilter, deletedAt: null } } } : {}),
      ...progressFilter,
    };

    const orderBy: Prisma.StrategicInitiativeOrderByWithRelationInput[] =
      options.sort === 'priority'
        ? [{ priority: 'asc' }, { targetDate: 'asc' }]
        : options.sort === 'targetDate'
          ? [{ targetDate: 'asc' }]
          : [{ createdAt: 'desc' }];

    const [data, total] = await Promise.all([
      this.prisma.strategicInitiative.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { risks: { where: { deletedAt: null }, select: { id: true, title: true, riskLevel: true, status: true } } },
      }),
      this.prisma.strategicInitiative.count({ where }),
    ]);

    return { data, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  async findOne(id: string, tenantId: string) {
    const initiative = await this.prisma.strategicInitiative.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: initiativeDetailInclude,
    });
    if (!initiative) {
      throw new NotFoundException('Strategic initiative not found');
    }
    return initiative;
  }

  async update(id: string, tenantId: string, dto: UpdateStrategicInitiativeDto) {
    await this.findOne(id, tenantId);

    return this.prisma.strategicInitiative.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        strategicObjective: dto.strategicObjective,
        owner: dto.owner,
        priority: dto.priority,
        weight: dto.weight,
        notes: dto.notes,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        targetDate: dto.targetDate ? new Date(dto.targetDate) : undefined,
        status: dto.status as Prisma.StrategicInitiativeUpdateInput['status'],
      },
      include: initiativeDetailInclude,
    });
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    await this.prisma.strategicInitiative.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { message: 'Strategic initiative deleted successfully' };
  }

  async linkRisk(id: string, tenantId: string, riskId: string) {
    const initiative = await this.findOne(id, tenantId);
    const risk = await this.prisma.risk.findFirst({
      where: { id: riskId, tenantId, organisationId: initiative.organisationId, deletedAt: null },
    });
    if (!risk) {
      throw new NotFoundException('Risk not found for this organisation');
    }

    return this.prisma.strategicInitiative.update({
      where: { id },
      data: { risks: { connect: { id: riskId } } },
      include: initiativeDetailInclude,
    });
  }

  async unlinkRisk(id: string, tenantId: string, riskId: string) {
    await this.findOne(id, tenantId);
    return this.prisma.strategicInitiative.update({
      where: { id },
      data: { risks: { disconnect: { id: riskId } } },
      include: initiativeDetailInclude,
    });
  }

  /** Returns the full initiative (not just the created milestone) -- consistent with linkRisk/unlinkRisk/recordProgress below, and what the detail page's `updated.milestones` needs to refresh its list without a full page reload. */
  async addMilestone(id: string, tenantId: string, dto: CreateMilestoneDto) {
    const initiative = await this.findOne(id, tenantId);
    await this.prisma.strategicMilestone.create({
      data: {
        tenantId,
        initiativeId: initiative.id,
        title: dto.title,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        status: (dto.status as Prisma.StrategicMilestoneCreateInput['status']) ?? undefined,
        sortOrder: dto.sortOrder ?? initiative.milestones.length,
      },
    });
    return this.findOne(id, tenantId);
  }

  private async findMilestone(initiativeId: string, tenantId: string, milestoneId: string) {
    await this.findOne(initiativeId, tenantId);
    const milestone = await this.prisma.strategicMilestone.findFirst({ where: { id: milestoneId, initiativeId } });
    if (!milestone) {
      throw new NotFoundException('Milestone not found for this initiative');
    }
    return milestone;
  }

  async updateMilestone(initiativeId: string, tenantId: string, milestoneId: string, dto: UpdateMilestoneDto) {
    await this.findMilestone(initiativeId, tenantId, milestoneId);
    return this.prisma.strategicMilestone.update({
      where: { id: milestoneId },
      data: {
        title: dto.title,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        // Marking COMPLETED without an explicit date stamps "now", matching RemediationInitiative's own actualCompletionDate convention.
        completedAt: dto.completedAt ? new Date(dto.completedAt) : dto.status === 'COMPLETED' ? new Date() : undefined,
        status: dto.status as Prisma.StrategicMilestoneUpdateInput['status'],
        sortOrder: dto.sortOrder,
      },
    });
  }

  async removeMilestone(initiativeId: string, tenantId: string, milestoneId: string) {
    await this.findMilestone(initiativeId, tenantId, milestoneId);
    await this.prisma.strategicMilestone.delete({ where: { id: milestoneId } });
    return { message: 'Milestone deleted successfully' };
  }

  /** Upserts this month's progress entry, then refreshes the initiative's cached `percentComplete` from whichever recorded month is now the most recent -- the two never drift apart because this is the only path that writes either. */
  async recordProgress(id: string, tenantId: string, dto: RecordProgressDto) {
    const initiative = await this.findOne(id, tenantId);
    const month = toMonthKey(dto.month);

    await this.prisma.strategicInitiativeProgress.upsert({
      where: { initiativeId_month: { initiativeId: initiative.id, month } },
      create: { tenantId, initiativeId: initiative.id, month, percentComplete: dto.percentComplete, note: dto.note },
      update: { percentComplete: dto.percentComplete, note: dto.note },
    });

    const latest = await this.prisma.strategicInitiativeProgress.findFirst({
      where: { initiativeId: initiative.id },
      orderBy: { month: 'desc' },
    });

    return this.prisma.strategicInitiative.update({
      where: { id: initiative.id },
      data: { percentComplete: latest?.percentComplete ?? 0 },
      include: initiativeDetailInclude,
    });
  }

  async removeProgress(initiativeId: string, tenantId: string, progressId: string) {
    const initiative = await this.findOne(initiativeId, tenantId);
    const entry = await this.prisma.strategicInitiativeProgress.findFirst({ where: { id: progressId, initiativeId: initiative.id } });
    if (!entry) {
      throw new NotFoundException('Progress entry not found for this initiative');
    }
    await this.prisma.strategicInitiativeProgress.delete({ where: { id: progressId } });

    const latest = await this.prisma.strategicInitiativeProgress.findFirst({
      where: { initiativeId: initiative.id },
      orderBy: { month: 'desc' },
    });
    return this.prisma.strategicInitiative.update({
      where: { id: initiative.id },
      data: { percentComplete: latest?.percentComplete ?? 0 },
      include: initiativeDetailInclude,
    });
  }

  /**
   * Master prompt's "Initiative Progress -> Monthly Progress -> Strategic Objective Progress ->
   * Overall Organisational Strategic Plan Progress" rollup, plus the executive dashboard's KPI set.
   * Cancelled initiatives are excluded from the overall/objective progress rollups (they were
   * never delivered, so averaging in their last known percentage would misrepresent completion)
   * but still counted in the status breakdown.
   */
  async getDashboard(tenantId: string, organisationId: string) {
    const initiatives = await this.prisma.strategicInitiative.findMany({
      where: { tenantId, organisationId, deletedAt: null },
      include: { risks: { where: { deletedAt: null }, select: { id: true, riskLevel: true } }, monthlyProgress: true },
    });

    const now = new Date();
    const byStatus: Record<string, number> = { NOT_STARTED: 0, IN_PROGRESS: 0, ON_HOLD: 0, COMPLETED: 0, CANCELLED: 0 };
    let overdueCount = 0;
    let atRiskCount = 0;
    let linkedToRiskCount = 0;
    const highRiskIds = new Set<string>();
    const objectiveBuckets = new Map<string, { sum: number; weight: number; count: number }>();

    for (const initiative of initiatives) {
      byStatus[initiative.status] = (byStatus[initiative.status] ?? 0) + 1;
      if (isOverdue(initiative, now)) overdueCount++;
      if (isAtRisk(initiative, now)) atRiskCount++;
      if (initiative.risks.length > 0) linkedToRiskCount++;
      // "Active" here excludes both COMPLETED (the risk's remediation already landed) and
      // CANCELLED (nothing is actually being done) -- NOT_STARTED/IN_PROGRESS/ON_HOLD count.
      if (!TERMINAL_STATUSES.includes(initiative.status)) {
        for (const risk of initiative.risks) {
          if (HIGH_RISK_LEVELS.includes(risk.riskLevel)) highRiskIds.add(risk.id);
        }
      }

      if (initiative.status === 'CANCELLED') continue;
      const objective = initiative.strategicObjective?.trim() || 'Unassigned';
      const bucket = objectiveBuckets.get(objective) ?? { sum: 0, weight: 0, count: 0 };
      bucket.sum += initiative.percentComplete * initiative.weight;
      bucket.weight += initiative.weight;
      bucket.count += 1;
      objectiveBuckets.set(objective, bucket);
    }

    const activeInitiatives = initiatives.filter((i) => i.status !== 'CANCELLED');
    const overallProgress = computeWeightedProgress(activeInitiatives);

    const monthActuals = new Map<string, { sum: number; weight: number }>();
    for (const initiative of initiatives) {
      if (initiative.status === 'CANCELLED') continue;
      for (const entry of initiative.monthlyProgress) {
        const key = monthKeyString(entry.month);
        const bucket = monthActuals.get(key) ?? { sum: 0, weight: 0 };
        bucket.sum += entry.percentComplete * initiative.weight;
        bucket.weight += initiative.weight;
        monthActuals.set(key, bucket);
      }
    }

    const monthlyTrend = [...monthActuals.keys()].sort().map((key) => {
      const bucket = monthActuals.get(key)!;
      const actual = bucket.weight > 0 ? Math.round((bucket.sum / bucket.weight) * 10) / 10 : 0;
      const [year, monthNumber] = key.split('-').map(Number);
      const monthDate = new Date(Date.UTC(year, monthNumber - 1, 1));

      const plannedEntries = activeInitiatives
        .map((i) => ({ percent: plannedPercentAt(i.startDate, i.targetDate, monthDate), weight: i.weight }))
        .filter((entry): entry is { percent: number; weight: number } => entry.percent !== null);
      const plannedWeight = plannedEntries.reduce((sum, e) => sum + e.weight, 0);
      const planned = plannedWeight > 0 ? Math.round((plannedEntries.reduce((sum, e) => sum + e.percent * e.weight, 0) / plannedWeight) * 10) / 10 : null;

      return { month: key, actual, planned };
    });

    const progressByObjective = [...objectiveBuckets.entries()]
      .map(([objective, bucket]) => ({
        objective,
        progress: bucket.weight > 0 ? Math.round((bucket.sum / bucket.weight) * 10) / 10 : 0,
        count: bucket.count,
      }))
      .sort((a, b) => b.count - a.count);

    return {
      overallProgress,
      totalInitiatives: initiatives.length,
      completed: byStatus.COMPLETED,
      inProgress: byStatus.IN_PROGRESS,
      notStarted: byStatus.NOT_STARTED,
      onHold: byStatus.ON_HOLD,
      cancelled: byStatus.CANCELLED,
      overdueCount,
      atRiskCount,
      linkedToRiskCount,
      highRiskWithInitiatives: highRiskIds.size,
      monthlyTrend,
      progressByObjective,
    };
  }
}
