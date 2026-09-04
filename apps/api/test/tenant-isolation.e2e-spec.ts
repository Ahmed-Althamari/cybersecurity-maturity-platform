import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { PrismaService } from '../src/prisma/prisma.service';

import { createTestApp } from './support/app';
import { cleanupTestTenant, createTestTenant, TEST_PASSWORD, type TestTenantFixture } from './support/fixtures';

async function login(app: INestApplication, email: string): Promise<string> {
  const response = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password: TEST_PASSWORD });
  return response.body.access_token;
}

describe('Tenant isolation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantA: TestTenantFixture;
  let tenantB: TestTenantFixture;
  let tokenA: string;
  let tokenB: string;
  let riskAId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    tenantA = await createTestTenant(prisma, { role: 'CISO', label: 'TenantA' });
    // ORGANISATION_ADMIN so tenantB clears RolesGuard on delete too — the 404 assertions below are testing tenant-scoping in the
    // service layer, not role-gating, so tokenB needs a role that's actually allowed to attempt every one of these operations.
    tenantB = await createTestTenant(prisma, { role: 'ORGANISATION_ADMIN', label: 'TenantB' });
    tokenA = await login(app, tenantA.email);
    tokenB = await login(app, tenantB.email);

    const createResponse = await request(app.getHttpServer())
      .post('/api/v1/risks')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ organisationId: tenantA.organisationId, title: 'Tenant A risk', likelihood: 4, impact: 4 })
      .expect(201);
    riskAId = createResponse.body.id;
  });

  afterAll(async () => {
    await cleanupTestTenant(prisma, tenantA.tenantId);
    await cleanupTestTenant(prisma, tenantB.tenantId);
    await app.close();
  });

  it('never returns another tenant\'s risk from a direct GET', async () => {
    await request(app.getHttpServer()).get(`/api/v1/risks/${riskAId}`).set('Authorization', `Bearer ${tokenB}`).expect(404);
  });

  it('never returns another tenant\'s risk from a list scoped by that tenant\'s own organisationId', async () => {
    // tokenB's JWT carries tenantB — even asking for tenantA's organisationId can only ever surface tenantB-scoped rows (i.e. none).
    const response = await request(app.getHttpServer())
      .get(`/api/v1/risks?organisationId=${tenantA.organisationId}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);

    expect(response.body).toEqual([]);
  });

  it('refuses to update another tenant\'s risk (404, not silently scoped)', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/risks/${riskAId}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ status: 'CLOSED' })
      .expect(404);
  });

  it('refuses to delete another tenant\'s risk', async () => {
    await request(app.getHttpServer()).delete(`/api/v1/risks/${riskAId}`).set('Authorization', `Bearer ${tokenB}`).expect(404);
  });

  it('the owning tenant can still read its own risk', async () => {
    const response = await request(app.getHttpServer()).get(`/api/v1/risks/${riskAId}`).set('Authorization', `Bearer ${tokenA}`).expect(200);
    expect(response.body.id).toBe(riskAId);
  });
});
