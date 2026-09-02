import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';

/**
 * Verifies real token revocation end-to-end (docs/threat-model.md's
 * token-revocation gap) -- not just that RevokedToken rows get written
 * (see auth.service.spec.ts / jwt.strategy.spec.ts for that in isolation),
 * but that a logged-out or refreshed-away token is actually rejected by
 * the real running app on the very next request. Requires a reachable
 * DATABASE_URL and the seeded demo tenant (see packages/database/prisma/
 * seed.ts), following tenant-security.integration-spec.ts's pattern.
 */
describe('Token revocation (integration)', () => {
  let app: INestApplication;
  let baseUrl: string;

  const demoPassword = process.env.DEMO_USER_PASSWORD || 'DemoPassword123!';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.listen(0);
    const address = app.getHttpServer().address();
    baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
  });

  afterAll(async () => {
    await app.close();
  });

  async function login(): Promise<string> {
    const res = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'ciso@example.local', password: demoPassword }),
    });
    if (res.status !== 201) {
      throw new Error(`login failed: ${res.status} ${await res.text()}`);
    }
    const body = await res.json();
    return body.access_token as string;
  }

  it('rejects a token after logout, on the very next request', async () => {
    const token = await login();
    const before = await fetch(`${baseUrl}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
    expect(before.status).toBe(200);

    const logoutRes = await fetch(`${baseUrl}/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(logoutRes.status).toBe(201);

    const after = await fetch(`${baseUrl}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
    expect(after.status).toBe(401);
  });

  it('does not affect a different, still-valid token for the same user (revocation is per-token, not per-user)', async () => {
    const tokenA = await login();
    const tokenB = await login();

    await fetch(`${baseUrl}/auth/logout`, { method: 'POST', headers: { Authorization: `Bearer ${tokenA}` } });

    const resA = await fetch(`${baseUrl}/auth/me`, { headers: { Authorization: `Bearer ${tokenA}` } });
    expect(resA.status).toBe(401);
    const resB = await fetch(`${baseUrl}/auth/me`, { headers: { Authorization: `Bearer ${tokenB}` } });
    expect(resB.status).toBe(200);
  });

  it('rotates on refresh: the pre-refresh token stops working, the new one works', async () => {
    const original = await login();

    const refreshRes = await fetch(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${original}` },
    });
    expect(refreshRes.status).toBe(201);
    const { access_token: refreshed } = await refreshRes.json();
    expect(refreshed).not.toBe(original);

    const oldRes = await fetch(`${baseUrl}/auth/me`, { headers: { Authorization: `Bearer ${original}` } });
    expect(oldRes.status).toBe(401);

    const newRes = await fetch(`${baseUrl}/auth/me`, { headers: { Authorization: `Bearer ${refreshed}` } });
    expect(newRes.status).toBe(200);
  });
});
