import { randomUUID } from 'crypto';

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

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    tenantA = await createTestTenant(prisma, { role: 'CISO', label: 'TenantA' });
    // PLATFORM_ADMIN so tenantB clears every role gate exercised anywhere in this file (Risk/Assessment
    // delete, User update/delete included, both of which are more tightly gated than write/read) —
    // these tests are about tenant-scoping in the service layer, not role-gating, so tokenB needs a
    // role that's actually allowed to attempt every operation below rather than getting turned away
    // with an unrelated 403 before the tenant check is ever reached.
    tenantB = await createTestTenant(prisma, { role: 'PLATFORM_ADMIN', label: 'TenantB' });
    tokenA = await login(app, tenantA.email);
    tokenB = await login(app, tenantB.email);
  });

  afterAll(async () => {
    await cleanupTestTenant(prisma, tenantA.tenantId);
    await cleanupTestTenant(prisma, tenantB.tenantId);
    await app.close();
  });

  describe('Risk', () => {
    let riskAId: string;

    beforeAll(async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/api/v1/risks')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ organisationId: tenantA.organisationId, title: 'Tenant A risk', likelihood: 4, impact: 4 })
        .expect(201);
      riskAId = createResponse.body.id;
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

  describe('RemediationInitiative', () => {
    let initiativeAId: string;

    beforeAll(async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/api/v1/remediation-initiatives')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ organisationId: tenantA.organisationId, title: 'Tenant A initiative' })
        .expect(201);
      initiativeAId = createResponse.body.id;
    });

    it('never returns another tenant\'s initiative from a direct GET', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/remediation-initiatives/${initiativeAId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);
    });

    it('never returns another tenant\'s initiative from a list scoped by that tenant\'s own organisationId', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/remediation-initiatives?organisationId=${tenantA.organisationId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);

      // GET /remediation-initiatives is paginated (search/page/pageSize — added for the
      // risk-detail page's initiative picker); an empty result is `{ data: [] }`, not a bare `[]`.
      expect(response.body.data).toEqual([]);
    });

    it('refuses to update another tenant\'s initiative (404, not silently scoped)', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/remediation-initiatives/${initiativeAId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ status: 'BLOCKED' })
        .expect(404);
    });

    it('refuses to link another tenant\'s risk to another tenant\'s initiative', async () => {
      // riskBId doesn't need to exist for this assertion — the initiative lookup itself 404s first,
      // since it's scoped to tokenB's own tenant and initiativeAId belongs to tenantA.
      await request(app.getHttpServer())
        .post(`/api/v1/remediation-initiatives/${initiativeAId}/risks/${randomUUID()}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);
    });

    it('refuses to delete another tenant\'s initiative', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/remediation-initiatives/${initiativeAId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);
    });

    it('the owning tenant can still read its own initiative', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/remediation-initiatives/${initiativeAId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      expect(response.body.id).toBe(initiativeAId);
    });
  });

  describe('Assessment', () => {
    let assessmentAId: string;

    beforeAll(async () => {
      // Assessment creation needs a real Framework to hang a default AssessmentTemplate off of; created
      // directly via Prisma (bypassing the API, same reasoning as createTestTenant) since a bare
      // Framework row is all `POST /assessments` actually needs — it doesn't touch the function/
      // category/subcategory tree at all.
      const framework = await prisma.framework.create({
        data: {
          tenantId: tenantA.tenantId,
          name: 'E2E Assessment Framework',
          slug: `e2e-assessment-fw-${randomUUID().slice(0, 8)}`,
          version: '1.0',
          frameWorkType: 'NIST_CSF',
        },
      });

      const createResponse = await request(app.getHttpServer())
        .post('/api/v1/assessments')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ organisationId: tenantA.organisationId, frameworkId: framework.id, name: 'Tenant A Assessment' })
        .expect(201);
      assessmentAId = createResponse.body.id;
    });

    it('never returns another tenant\'s assessment from a direct GET', async () => {
      await request(app.getHttpServer()).get(`/api/v1/assessments/${assessmentAId}`).set('Authorization', `Bearer ${tokenB}`).expect(404);
    });

    it('never returns another tenant\'s assessment from a list scoped by that tenant\'s own organisationId', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/assessments?organisationId=${tenantA.organisationId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);

      expect(response.body).toEqual([]);
    });

    it('refuses to update another tenant\'s assessment', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/assessments/${assessmentAId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ name: 'Hijacked' })
        .expect(404);
    });

    it('refuses to delete another tenant\'s assessment', async () => {
      await request(app.getHttpServer()).delete(`/api/v1/assessments/${assessmentAId}`).set('Authorization', `Bearer ${tokenB}`).expect(404);
    });

    it('the owning tenant can still read its own assessment', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/assessments/${assessmentAId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      expect(response.body.id).toBe(assessmentAId);
    });
  });

  describe('Framework', () => {
    let frameworkAId: string;

    beforeAll(async () => {
      const framework = await prisma.framework.create({
        data: {
          tenantId: tenantA.tenantId,
          name: 'E2E Standalone Framework',
          slug: `e2e-standalone-fw-${randomUUID().slice(0, 8)}`,
          version: '1.0',
          frameWorkType: 'NIST_CSF',
        },
      });
      frameworkAId = framework.id;
    });

    it('never returns another tenant\'s framework from a direct GET', async () => {
      await request(app.getHttpServer()).get(`/api/v1/frameworks/${frameworkAId}`).set('Authorization', `Bearer ${tokenB}`).expect(404);
    });

    it('never lists another tenant\'s framework', async () => {
      // Frameworks aren't organisation-scoped like Risk/Assessment (no organisationId on the model at
      // all) — GET /frameworks is purely tenant-scoped, so tenantB's own list stays empty throughout.
      const response = await request(app.getHttpServer()).get('/api/v1/frameworks').set('Authorization', `Bearer ${tokenB}`).expect(200);
      expect(response.body).toEqual([]);
    });

    it('refuses to view another tenant\'s framework navigation', async () => {
      await request(app.getHttpServer()).get(`/api/v1/frameworks/${frameworkAId}/navigation`).set('Authorization', `Bearer ${tokenB}`).expect(404);
    });

    it('the owning tenant can still read its own framework', async () => {
      const response = await request(app.getHttpServer()).get(`/api/v1/frameworks/${frameworkAId}`).set('Authorization', `Bearer ${tokenA}`).expect(200);
      expect(response.body.id).toBe(frameworkAId);
    });
  });

  describe('User', () => {
    it('never returns another tenant\'s user from a direct GET', async () => {
      await request(app.getHttpServer()).get(`/api/v1/users/${tenantA.userId}`).set('Authorization', `Bearer ${tokenB}`).expect(404);
    });

    it('never lists another tenant\'s user in findAll', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/users').set('Authorization', `Bearer ${tokenB}`).expect(200);
      expect(response.body.find((user: { id: string }) => user.id === tenantA.userId)).toBeUndefined();
    });

    it('refuses to update another tenant\'s user (404, not silently scoped)', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/users/${tenantA.userId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ name: 'Hijacked' })
        .expect(404);
    });

    it('refuses to delete another tenant\'s user', async () => {
      await request(app.getHttpServer()).delete(`/api/v1/users/${tenantA.userId}`).set('Authorization', `Bearer ${tokenB}`).expect(404);
    });

    it('the owning tenant can still read its own user', async () => {
      const response = await request(app.getHttpServer()).get(`/api/v1/users/${tenantA.userId}`).set('Authorization', `Bearer ${tokenA}`).expect(200);
      expect(response.body.id).toBe(tenantA.userId);
    });
  });
});
