import { randomUUID } from 'crypto';

import { INestApplication } from '@nestjs/common';

import { PrismaService } from '../src/prisma/prisma.service';

import { createTestApp } from './support/app';

/**
 * Verifies audit log immutability at the database level
 * (docs/security-architecture.md's "Known gaps" #5) -- not application-
 * level (the app never issues an UPDATE against audit_events anyway), but
 * a real Postgres trigger that rejects it unconditionally, for any role,
 * with no bypass. See the migration's own comment
 * (packages/database/prisma/migrations/*_audit_events_immutable_update)
 * for why this is scoped to UPDATE only, not DELETE: AuditEvent.tenantId
 * has `onDelete: Cascade`, so deleting a Tenant (a real, legitimate
 * operation) cascades into deleting its audit_events rows through the
 * same DELETE machinery a row-level trigger can't distinguish from a
 * direct, illegitimate DELETE -- blocking DELETE unconditionally would
 * have broken that cascade (confirmed live before writing this test, by
 * creating a throwaway tenant/user/audit-event and deleting the tenant).
 */
describe('Audit log immutability (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let tenantId: string;
  let userId: string;

  beforeAll(async () => {
    app = await createTestApp();
    await app.listen(0);
    prisma = app.get(PrismaService);

    const tenant = await prisma.tenant.create({
      data: { name: 'Audit Immutability Test Tenant', slug: `audit-immutable-${randomUUID()}` },
    });
    tenantId = tenant.id;
    const user = await prisma.user.create({
      data: {
        email: `audit-immutable-${randomUUID()}@e2e-test.local`,
        name: 'Audit Immutability Test User',
        passwordHash: 'x',
        tenantId,
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    // DELETE is not blocked (only UPDATE) -- see the migration's comment.
    await prisma.auditEvent.deleteMany({ where: { tenantId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
    await app.close();
  });

  it('rejects a direct UPDATE against an audit_events row, unconditionally', async () => {
    const event = await prisma.auditEvent.create({
      data: { tenantId, userId, action: 'LOGIN', resource: 'Auth', description: 'original' },
    });

    await expect(
      prisma.auditEvent.update({ where: { id: event.id }, data: { description: 'tampered' } }),
    ).rejects.toThrow();

    const stillOriginal = await prisma.auditEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(stillOriginal.description).toBe('original');
  });

  it('still allows a direct DELETE (not blocked -- only UPDATE is)', async () => {
    const event = await prisma.auditEvent.create({
      data: { tenantId, userId, action: 'LOGOUT', resource: 'Auth', description: 'to be deleted' },
    });

    await expect(prisma.auditEvent.delete({ where: { id: event.id } })).resolves.toBeDefined();
    await expect(prisma.auditEvent.findUnique({ where: { id: event.id } })).resolves.toBeNull();
  });
});
