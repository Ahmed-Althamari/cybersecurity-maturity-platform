import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { PrismaService } from '../src/prisma/prisma.service';

import { createTestApp } from './support/app';
import { cleanupTestTenant, createTestTenant, TEST_PASSWORD, type TestTenantFixture } from './support/fixtures';

/**
 * Split out from auth.e2e-spec.ts on purpose: this file logs in several
 * times to set up two independent sessions, and every spec file using
 * createTestApp() runs against the real (un-bypassed — see that
 * helper's own comment) POST /auth/login throttle. Keeping this in its
 * own file gives it a clean 5-logins-per-60s budget rather than sharing
 * one with auth.e2e-spec.ts's own login/failure-path tests.
 */
describe('Token revocation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fixture: TestTenantFixture;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    fixture = await createTestTenant(prisma, { role: 'CISO', label: 'Revocation' });
  });

  afterAll(async () => {
    await cleanupTestTenant(prisma, fixture.tenantId);
    await app.close();
  });

  it('revokes exactly the token that logged out, leaving other sessions for the same user usable', async () => {
    const sessionA = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: fixture.email, password: TEST_PASSWORD });
    const sessionB = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: fixture.email, password: TEST_PASSWORD });

    await request(app.getHttpServer()).get('/api/v1/auth/me').set('Authorization', `Bearer ${sessionA.body.access_token}`).expect(200);

    await request(app.getHttpServer()).post('/api/v1/auth/logout').set('Authorization', `Bearer ${sessionA.body.access_token}`).expect(201);

    // Session A's own token is now dead, even though it hasn't naturally expired.
    await request(app.getHttpServer()).get('/api/v1/auth/me').set('Authorization', `Bearer ${sessionA.body.access_token}`).expect(401);

    // Session B — a different token for the same user — was never touched.
    await request(app.getHttpServer()).get('/api/v1/auth/me').set('Authorization', `Bearer ${sessionB.body.access_token}`).expect(200);
  });

  it('a token can never be used to log out twice, since the first logout already revoked it', async () => {
    const login = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: fixture.email, password: TEST_PASSWORD });

    await request(app.getHttpServer()).post('/api/v1/auth/logout').set('Authorization', `Bearer ${login.body.access_token}`).expect(201);
    await request(app.getHttpServer()).post('/api/v1/auth/logout').set('Authorization', `Bearer ${login.body.access_token}`).expect(401);
  });
});
