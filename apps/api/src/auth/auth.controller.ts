import { Controller, Post, Body, Get, UseGuards, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { AuditLog } from '../audit/decorators/audit-log.decorator';

import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { AuthenticatedRequest } from './types/authenticated-request';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  @AuditLog('LOGIN', 'User')
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Post('logout')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @AuditLog('LOGOUT', 'User')
  async logout() {
    return this.authService.logout();
  }

  @Post('refresh')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async refresh(@Req() req: Request) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      throw new Error('No token provided');
    }
    return this.authService.refreshToken(token);
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async getCurrentUser(@Req() req: AuthenticatedRequest) {
    const user = req.user;
    return {
      id: user.sub,
      email: user.email,
      name: user.name,
      tenantId: user.tenantId,
      organisationId: user.organisationId,
      role: user.role,
      roles: user.roles,
    };
  }
}
