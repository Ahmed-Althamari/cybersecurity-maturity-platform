import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { PrismaService } from '../src/prisma/prisma.service';

import { createTestApp } from './support/app';
import { cleanupTestTenant, createTestTenant, TEST_PASSWORD, type TestTenantFixture } from './support/fixtures';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fixture: TestTenantFixture;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    fixture = await createTestTenant(prisma, { role: 'CISO', label: 'Auth' });
  });

  afterAll(async () => {
    await cleanupTestTenant(prisma, fixture.tenantId);
    await app.close();
  });

  it('logs in with correct credentials and returns a token scoped to the right tenant', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: fixture.email, password: TEST_PASSWORD })
      .expect(201);

    expect(response.body.access_token).toEqual(expect.any(String));
    expect(response.body.user).toMatchObject({ id: fixture.userId, tenantId: fixture.tenantId, role: 'CISO' });
  });

  it('rejects a wrong password', async () => {
    await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: fixture.email, password: 'WrongPassword123!' }).expect(401);
  });

  it('rejects a nonexistent email', async () => {
    await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: 'nobody@e2e.test', password: TEST_PASSWORD }).expect(401);
  });

  it('rejects a protected route with no token', async () => {
    await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
  });

  it('rejects a protected route with a malformed token', async () => {
    await request(app.getHttpServer()).get('/api/v1/auth/me').set('Authorization', 'Bearer not-a-real-token').expect(401);
  });

  it('returns the current user for a valid token', async () => {
    const login = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: fixture.email, password: TEST_PASSWORD });

    const response = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${login.body.access_token}`)
      .expect(200);

    expect(response.body.id).toBe(fixture.userId);
  });
});
