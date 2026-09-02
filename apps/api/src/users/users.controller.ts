import { UserRole } from '@cmmp/shared';
import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';


@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.ORGANISATION_ADMIN)
  async create(
    @Body() createUserDto: CreateUserDto,
    @CurrentUser() user: any,
  ) {
    return this.usersService.create(user.tenantId, createUserDto);
  }

  @Get()
  async findAll(
    @Query('page') page: string | undefined,
    @Query('pageSize') pageSize: string | undefined,
    @CurrentUser() user: any,
  ) {
    return this.usersService.findAll(user.tenantId, { page: Number(page), pageSize: Number(pageSize) });
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    return this.usersService.findOne(id, user.tenantId);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ORGANISATION_ADMIN, UserRole.PLATFORM_ADMIN)
  async update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @CurrentUser() user: any,
  ) {
    return this.usersService.update(id, user.tenantId, updateUserDto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.PLATFORM_ADMIN)
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    return this.usersService.remove(id, user.tenantId);
  }

  @Get(':id/roles')
  async getUserRoles(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    return this.usersService.getUserRoles(id, user.tenantId);
  }

  @Post(':id/roles/:role')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ORGANISATION_ADMIN, UserRole.PLATFORM_ADMIN)
  async assignRole(
    @Param('id') id: string,
    @Param('role') role: string,
    @CurrentUser() user: any,
  ) {
    return this.usersService.assignRole(id, user.tenantId, role);
  }

  @Delete(':id/roles/:role')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ORGANISATION_ADMIN, UserRole.PLATFORM_ADMIN)
  async removeRole(
    @Param('id') id: string,
    @Param('role') role: string,
    @CurrentUser() user: any,
  ) {
    return this.usersService.removeRole(id, user.tenantId, role);
  }
}
