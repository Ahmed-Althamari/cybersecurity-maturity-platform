import { Controller, Post, Body, Get, UseGuards, Req } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';

import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { ExecutiveDashboardAccessible } from './decorators/executive-dashboard-accessible.decorator';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { AuthenticatedUser } from './types/authenticated-user';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  // Brute-force protection: AUTH_RATE_LIMIT_MAX_ATTEMPTS attempts per
  // AUTH_RATE_LIMIT_WINDOW_MS per IP (see AuthModule) -- this was a real,
  // documented gap (docs/threat-model.md's top-priority finding) with zero
  // mitigation before this. Not applied globally (see AuthModule's
  // ThrottlerModule.forRootAsync comment) -- only login is an unauthenticated,
  // credential-guessing surface; every other route already requires a valid
  // JWT to reach at all.
  @UseGuards(ThrottlerGuard)
  @Post('login')
  async login(@Body() loginDto: LoginDto, @Req() req: Request) {
    return this.authService.login(loginDto, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  // Session lifecycle (logout/refresh/me) is available to every
  // authenticated role regardless of ExecutiveViewerScopeGuard's
  // dashboard-only restriction -- an EXECUTIVE_VIEWER-only user must still
  // be able to log out, refresh, or see who they are.
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ExecutiveDashboardAccessible()
  async logout(@Req() req: Request) {
    return this.authService.logout((req as any).user, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post('refresh')
  @UseGuards(JwtAuthGuard)
  @ExecutiveDashboardAccessible()
  async refresh(@Req() req: Request) {
    const token = (req as any).headers.authorization?.replace('Bearer ', '');
    if (!token) {
      throw new Error('No token provided');
    }
    return this.authService.refreshToken(token);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @ExecutiveDashboardAccessible()
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.authService.changePassword(user, dto, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ExecutiveDashboardAccessible()
  async getCurrentUser(@Req() req: Request) {
    const user = (req as any).user;
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
