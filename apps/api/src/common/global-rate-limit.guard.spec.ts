import { HttpException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { GlobalRateLimitGuard } from './global-rate-limit.guard';

function makeContext(ip: string): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ ip }) }),
  } as unknown as ExecutionContext;
}

function makeConfig(values: Record<string, string>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

describe('GlobalRateLimitGuard', () => {
  it('allows requests under the configured budget', () => {
    const guard = new GlobalRateLimitGuard(
      makeConfig({ RATE_LIMIT_WINDOW_MS: '60000', RATE_LIMIT_MAX_REQUESTS: '3' }),
    );
    const context = makeContext('1.2.3.4');
    expect(guard.canActivate(context)).toBe(true);
    expect(guard.canActivate(context)).toBe(true);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('throws 429 once the same IP exceeds the budget within the window', () => {
    const guard = new GlobalRateLimitGuard(
      makeConfig({ RATE_LIMIT_WINDOW_MS: '60000', RATE_LIMIT_MAX_REQUESTS: '2' }),
    );
    const context = makeContext('1.2.3.4');
    guard.canActivate(context);
    guard.canActivate(context);
    expect(() => guard.canActivate(context)).toThrow(HttpException);
    try {
      guard.canActivate(context);
    } catch (err) {
      expect((err as HttpException).getStatus()).toBe(429);
    }
  });

  it('tracks separate IPs independently -- one IP over budget does not affect another', () => {
    const guard = new GlobalRateLimitGuard(
      makeConfig({ RATE_LIMIT_WINDOW_MS: '60000', RATE_LIMIT_MAX_REQUESTS: '1' }),
    );
    guard.canActivate(makeContext('1.1.1.1'));
    expect(() => guard.canActivate(makeContext('1.1.1.1'))).toThrow(HttpException);
    // A different IP has spent nothing of its own budget yet.
    expect(guard.canActivate(makeContext('2.2.2.2'))).toBe(true);
  });

  it('resets the budget once the window has elapsed', () => {
    const guard = new GlobalRateLimitGuard(
      makeConfig({ RATE_LIMIT_WINDOW_MS: '10', RATE_LIMIT_MAX_REQUESTS: '1' }),
    );
    const context = makeContext('1.2.3.4');
    guard.canActivate(context);
    expect(() => guard.canActivate(context)).toThrow(HttpException);
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(guard.canActivate(context)).toBe(true);
        resolve();
      }, 20);
    });
  });

  it('is a no-op when ENABLE_RATE_LIMITING is explicitly "false"', () => {
    const guard = new GlobalRateLimitGuard(
      makeConfig({
        ENABLE_RATE_LIMITING: 'false',
        RATE_LIMIT_WINDOW_MS: '60000',
        RATE_LIMIT_MAX_REQUESTS: '1',
      }),
    );
    const context = makeContext('1.2.3.4');
    for (let i = 0; i < 10; i++) {
      expect(guard.canActivate(context)).toBe(true);
    }
  });

  it('defaults to 900000ms/100 requests when the env vars are unset', () => {
    const guard = new GlobalRateLimitGuard(makeConfig({}));
    const context = makeContext('1.2.3.4');
    for (let i = 0; i < 100; i++) {
      expect(guard.canActivate(context)).toBe(true);
    }
    expect(() => guard.canActivate(context)).toThrow(HttpException);
  });
});
