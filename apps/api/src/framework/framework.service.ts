import {
  FrameworkNotFoundError,
  FrameworkValidationError,
  assertValidFrameworkDefinition,
  buildFrameworkComponentDescriptor,
  loadFrameworkTree,
  persistFrameworkDefinition,
} from '@cmmp/framework-engine';
import type {
  FrameworkQueryClient,
  FrameworkWriteClient,
  RawFrameworkRecord,
} from '@cmmp/framework-engine';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FrameworkService {
  constructor(private prisma: PrismaService) {}

  // Adapts the generated Prisma client to the framework-engine package's
  // minimal structural interfaces. Kept as explicit object literals (rather
  // than passing `this.prisma` directly) so the cast lives in one obvious
  // place instead of relying on Prisma's generic delegate types happening
  // to satisfy the package-agnostic interfaces.
  private get queryClient(): FrameworkQueryClient {
    return {
      framework: {
        findFirst: (args) =>
          this.prisma.framework.findFirst(args as never) as unknown as Promise<RawFrameworkRecord | null>,
      },
    };
  }

  private get writeClient(): FrameworkWriteClient {
    return {
      framework: {
        create: (args) =>
          this.prisma.framework.create(args as never) as unknown as Promise<RawFrameworkRecord>,
      },
    };
  }

  async findAll(tenantId: string) {
    return this.prisma.framework.findMany({
      where: { tenantId, deletedAt: null },
      select: {
        id: true,
        name: true,
        slug: true,
        version: true,
        frameWorkType: true,
        description: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async getTree(tenantId: string, slug: string, version?: string) {
    try {
      return await loadFrameworkTree(this.queryClient, { tenantId, slug, version });
    } catch (error) {
      if (error instanceof FrameworkNotFoundError) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }
  }

  async getComponentDescriptor(tenantId: string, slug: string, version?: string) {
    const tree = await this.getTree(tenantId, slug, version);
    return buildFrameworkComponentDescriptor(tree);
  }

  /**
   * Validates a framework-agnostic definition without persisting it — used
   * by import/preview flows (Phase 8) to surface structural errors before
   * committing to a create.
   */
  validateDefinition(input: unknown) {
    try {
      const definition = assertValidFrameworkDefinition(input);
      return { valid: true as const, definition };
    } catch (error) {
      if (error instanceof FrameworkValidationError) {
        return { valid: false as const, issues: error.issues };
      }
      throw error;
    }
  }

  async create(tenantId: string, input: unknown) {
    let definition;
    try {
      definition = assertValidFrameworkDefinition(input);
    } catch (error) {
      if (error instanceof FrameworkValidationError) {
        throw new BadRequestException({
          message: 'Invalid framework definition',
          issues: error.issues,
        });
      }
      throw error;
    }

    try {
      return await persistFrameworkDefinition(this.writeClient, tenantId, definition);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(
          `A framework with slug '${definition.slug}' version '${definition.version}' already exists for this tenant`,
        );
      }
      throw error;
    }
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}
