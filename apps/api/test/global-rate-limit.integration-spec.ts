import { INestApplication } from '@nestjs/common';
import { createTestApp } from './test-app';

/**
 * Verifies the real, end-to-end behavior of the generic, API-wide request
 * budget (docs/threat-model.md's previously-unbuilt RATE_LIMIT_WINDOW_MS/
 * RATE_LIMIT_MAX_REQUESTS/ENABLE_RATE_LIMITING, now GlobalRateLimitGuard)
 * -- not just that the guard's own logic works in isolation (see
 * global-rate-limit.guard.spec.ts for that), but that it's actually wired
 * up globally and doesn't interfere with the separate, pre-existing login
 * throttle. That interference is exactly what a first (later reverted)
 * implementation of this feature caused -- see app.module.ts's own
 * comment -- caught only by running auth-rate-limit.integration-spec.ts
 * side by side with this one, not by unit-testing either in isolation.
 *
 * A small, fast, deterministic budget is set here via process.env
 * *before* the module compiles, same pattern as
 * auth-rate-limit.integration-spec.ts, independent of whatever the real
 * deployment default is.
 */
describe('Global API rate limit (integration)', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    process.env.RATE_LIMIT_MAX_REQUESTS = '5';
    process.env.RATE_LIMIT_WINDOW_MS = '60000';

    app = await createTestApp();
    await app.listen(0);
    const address = app.getHttpServer().address();
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    delete process.env.RATE_LIMIT_MAX_REQUESTS;
    delete process.env.RATE_LIMIT_WINDOW_MS;
    await app.close();
  });

  it('rejects further requests with 429 once the per-IP budget (5/60s here) is exhausted, on an unauthenticated route', async () => {
    // /health has no guard of its own -- a global guard is the only thing
    // that could possibly throttle it, proving this one really is global.
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await fetch(`${baseUrl}/health`);
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
    expect(statuses[5]).toBe(429);
  });
});
