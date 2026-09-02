import { Controller, Post, Body, Get, UseGuards, Req } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';

import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

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

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(@Req() req: Request) {
    return this.authService.logout((req as any).user, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post('refresh')
  @UseGuards(JwtAuthGuard)
  async refresh(@Req() req: Request) {
    const token = (req as any).headers.authorization?.replace('Bearer ', '');
    if (!token) {
      throw new Error('No token provided');
    }
    return this.authService.refreshToken(token);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
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
