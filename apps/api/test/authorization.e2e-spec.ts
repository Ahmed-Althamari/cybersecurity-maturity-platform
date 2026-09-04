import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { PrismaService } from '../src/prisma/prisma.service';

import { createTestApp } from './support/app';
import { cleanupTestTenant, createTestTenant, TEST_PASSWORD, type TestTenantFixture } from './support/fixtures';

async function login(app: INestApplication, email: string): Promise<string> {
  const response = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password: TEST_PASSWORD });
  return response.body.access_token;
}

describe('Authorization (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenant: TestTenantFixture;
  let admin: TestTenantFixture;
  let auditor: TestTenantFixture;
  let viewerToken: string;
  let adminToken: string;
  let auditorToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    tenant = await createTestTenant(prisma, { role: 'READ_ONLY_VIEWER', label: 'Viewer' });
    admin = await createTestTenant(prisma, { role: 'PLATFORM_ADMIN', label: 'Admin' });
    auditor = await createTestTenant(prisma, { role: 'AUDITOR', label: 'Auditor' });
    viewerToken = await login(app, tenant.email);
    adminToken = await login(app, admin.email);
    auditorToken = await login(app, auditor.email);
  });

  afterAll(async () => {
    await cleanupTestTenant(prisma, tenant.tenantId);
    await cleanupTestTenant(prisma, admin.tenantId);
    await cleanupTestTenant(prisma, auditor.tenantId);
    await app.close();
  });

  it('blocks a READ_ONLY_VIEWER from creating a risk', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/risks')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ organisationId: tenant.organisationId, title: 'Should be blocked', likelihood: 3, impact: 3 })
      .expect(403);
  });

  it('lets a PLATFORM_ADMIN create a risk', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/risks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ organisationId: admin.organisationId, title: 'Admin-created risk', likelihood: 3, impact: 3 })
      .expect(201);
  });

  it('blocks a READ_ONLY_VIEWER from reading the audit log', async () => {
    // Regression test for a Phase 13 bug: @Roles() applied at the controller class level was a
    // silent no-op against RolesGuard (which only reads handler-level metadata), so every
    // authenticated role — not just the intended ones — could read /audit-events.
    await request(app.getHttpServer()).get('/api/v1/audit-events').set('Authorization', `Bearer ${viewerToken}`).expect(403);
  });

  it('lets an AUDITOR read the audit log', async () => {
    await request(app.getHttpServer()).get('/api/v1/audit-events').set('Authorization', `Bearer ${auditorToken}`).expect(200);
  });

  it('lets a PLATFORM_ADMIN read the audit log', async () => {
    await request(app.getHttpServer()).get('/api/v1/audit-events').set('Authorization', `Bearer ${adminToken}`).expect(200);
  });

  it('blocks a non-admin role from deleting a risk even though it can create one', async () => {
    // CISO is in RISK_WRITE_ROLES (can create/update) but not in the delete-only PLATFORM_ADMIN/ORGANISATION_ADMIN set.
    const ciso = await createTestTenant(prisma, { role: 'CISO', label: 'Ciso' });
    const cisoToken = await login(app, ciso.email);

    const created = await request(app.getHttpServer())
      .post('/api/v1/risks')
      .set('Authorization', `Bearer ${cisoToken}`)
      .send({ organisationId: ciso.organisationId, title: 'Ciso risk', likelihood: 2, impact: 2 })
      .expect(201);

    await request(app.getHttpServer()).delete(`/api/v1/risks/${created.body.id}`).set('Authorization', `Bearer ${cisoToken}`).expect(403);

    await cleanupTestTenant(prisma, ciso.tenantId);
  });
});
