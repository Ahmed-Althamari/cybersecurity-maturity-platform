import { INestApplication } from '@nestjs/common';

import { createTestApp } from './test-app';

/**
 * Verifies the real, end-to-end behavior of the login brute-force guard
 * (see AuthModule/AuthController) -- not just that a guard decorator is
 * present, but that hammering the real endpoint over real HTTP actually
 * gets rejected once the budget is spent. Boots the real AppModule like
 * tenant-security.integration-spec.ts; needs a reachable DATABASE_URL for
 * ConfigModule/PrismaModule to initialize, even though this suite itself
 * never queries the database.
 *
 * A small, fast, deterministic budget is set here (5 attempts / 60s) via
 * process.env *before* the module compiles, independent of whatever the
 * real deployment default is -- this suite would otherwise be at the mercy
 * of that number changing.
 */
describe('Login rate limiting (integration)', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    process.env.AUTH_RATE_LIMIT_MAX_ATTEMPTS = '5';
    process.env.AUTH_RATE_LIMIT_WINDOW_MS = '60000';

    app = await createTestApp();
    await app.listen(0);
    const address = app.getHttpServer().address();
    baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
  });

  afterAll(async () => {
    await app.close();
  });

  async function attemptLogin(): Promise<Response> {
    return fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'ciso@example.local', password: 'definitely-the-wrong-password' }),
    });
  }

  it('rejects further login attempts with 429 once the per-IP budget (5/60s here) is exhausted', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await attemptLogin();
      statuses.push(res.status);
    }

    // The first 5 are rejected on their own merits (wrong password -> 401),
    // never on the guard -- only the 6th, over budget, should 429.
    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(statuses[5]).toBe(429);
  });

  it('does not throttle an unrelated route sharing the same IP (guard is scoped to login only)', async () => {
    // A burst well past the login budget, aimed at a completely different
    // route -- if the guard were ever accidentally applied globally, this
    // would start 429ing too. It should keep 401ing (missing auth) instead.
    let lastStatus = 0;
    for (let i = 0; i < 8; i++) {
      const res = await fetch(`${baseUrl}/frameworks`);
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(401);
  });
});
