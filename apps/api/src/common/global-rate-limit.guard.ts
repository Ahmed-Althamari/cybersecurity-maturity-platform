import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Generic, API-wide per-IP request budget (docs/threat-model.md's
 * previously-unbuilt RATE_LIMIT_WINDOW_MS/RATE_LIMIT_MAX_REQUESTS/
 * ENABLE_RATE_LIMITING) -- separate from and unrelated to AuthModule's own
 * login-specific throttle (AUTH_RATE_LIMIT_WINDOW_MS/AUTH_RATE_LIMIT_MAX_ATTEMPTS).
 * Registered globally (APP_GUARD in app.module.ts), so it runs on every
 * request regardless of what other guards a route has.
 *
 * Hand-rolled rather than a second @nestjs/throttler registration -- see
 * app.module.ts's own comment for the real collision that approach caused.
 * In-memory only, same as this library's own default storage (no
 * behavioral downgrade); one Map entry per distinct client IP, pruned
 * opportunistically on each check rather than needing a separate cleanup
 * job (the same self-cleaning pattern already used for RevokedToken).
 */
@Injectable()
export class GlobalRateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    if (this.config.get<string>('ENABLE_RATE_LIMITING') === 'false') {
      return true;
    }

    const windowMs = Number(this.config.get<string>('RATE_LIMIT_WINDOW_MS')) || 900_000;
    const maxRequests = Number(this.config.get<string>('RATE_LIMIT_MAX_REQUESTS')) || 100;
    const now = Date.now();

    // Opportunistic cleanup -- an expired bucket is provably dead weight
    // (its own resetAt has already passed), so there is no separate
    // cleanup job or unbounded memory growth from long-idle client IPs.
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) {
        this.buckets.delete(key);
      }
    }

    const request = context.switchToHttp().getRequest();
    const key: string = request.ip ?? 'unknown';

    let bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      this.buckets.set(key, bucket);
    }

    bucket.count += 1;
    if (bucket.count > maxRequests) {
      throw new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS);
    }

    return true;
  }
}
