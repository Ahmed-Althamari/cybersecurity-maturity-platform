import type { PaginatedResponse } from '@cmmp/shared';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

import { type PaginationInput, resolvePagination, toPaginatedResponse } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';

import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const SALT_ROUNDS = 12;

const userSummarySelect = {
  id: true,
  email: true,
  name: true,
  tenantId: true,
  organisationId: true,
  isActive: true,
  lastLogin: true,
  createdAt: true,
  updatedAt: true,
};

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async create(tenantId: string, createUserDto: CreateUserDto) {
    const existing = await this.prisma.user.findFirst({
      where: { tenantId, email: createUserDto.email, deletedAt: null },
    });
    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }

    const passwordHash = await bcrypt.hash(createUserDto.password, SALT_ROUNDS);

    return this.prisma.user.create({
      data: {
        tenantId,
        organisationId: createUserDto.organisationId,
        email: createUserDto.email,
        name: createUserDto.name,
        passwordHash,
      },
      select: userSummarySelect,
    });
  }

  async findAll(tenantId: string, paginationInput: PaginationInput = {}): Promise<PaginatedResponse<unknown>> {
    const pagination = resolvePagination(paginationInput);
    const where = { tenantId, deletedAt: null };
    const [total, data] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        select: userSummarySelect,
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
    ]);
    return toPaginatedResponse(data, total, pagination);
  }

  async findOne(id: string, tenantId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: userSummarySelect,
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async update(id: string, tenantId: string, updateUserDto: UpdateUserDto) {
    await this.findOne(id, tenantId);
    return this.prisma.user.update({
      where: { id },
      data: updateUserDto,
      select: userSummarySelect,
    });
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
    return { message: 'User deleted successfully' };
  }

  async getUserRoles(userId: string, tenantId: string) {
    await this.findOne(userId, tenantId);
    return this.prisma.userRoleAssignment.findMany({
      where: { userId, tenantId, deletedAt: null },
    });
  }

  async assignRole(userId: string, tenantId: string, role: string, organisationId?: string) {
    await this.findOne(userId, tenantId);
    const existing = await this.prisma.userRoleAssignment.findFirst({
      where: { userId, tenantId, role, organisationId: organisationId ?? null },
    });

    if (existing) {
      await this.prisma.userRoleAssignment.update({
        where: { id: existing.id },
        data: { deletedAt: null },
      });
    } else {
      await this.prisma.userRoleAssignment.create({
        data: { userId, tenantId, role, organisationId },
      });
    }

    return { message: 'Role assigned successfully' };
  }

  async removeRole(userId: string, tenantId: string, role: string) {
    await this.findOne(userId, tenantId);
    await this.prisma.userRoleAssignment.updateMany({
      where: { userId, tenantId, role, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return { message: 'Role removed successfully' };
  }
}
