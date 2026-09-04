import { Controller, Post, Body, Get, UseGuards, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';

import { AuditLog } from '../audit/decorators/audit-log.decorator';

import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { AuthenticatedRequest, RequestUser } from './types/authenticated-request';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  // 5 attempts/minute/IP — much tighter than the app-wide default. Login is the one endpoint an
  // attacker can hit with zero prior authentication, so it's the one that actually needs a
  // brute-force-resistant limit rather than just general abuse protection.
  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @AuditLog('LOGIN', 'User')
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Post('logout')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @AuditLog('LOGOUT', 'User')
  async logout(@CurrentUser() user: RequestUser) {
    // exp is seconds-since-epoch (the JWT standard); Date wants milliseconds.
    return this.authService.logout(user.jti, new Date(user.exp * 1000));
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
