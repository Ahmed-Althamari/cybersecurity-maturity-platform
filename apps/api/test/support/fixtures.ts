import { randomUUID } from 'crypto';

import * as bcrypt from 'bcryptjs';

import type { PrismaService } from '../../src/prisma/prisma.service';

// Low cost is fine here — these hashes only ever need to satisfy bcrypt.compare in a test process, never resist a real attack.
const TEST_SALT_ROUNDS = 4;
export const TEST_PASSWORD = 'TestPassword123!';

export interface TestTenantFixture {
  tenantId: string;
  organisationId: string;
  userId: string;
  email: string;
}

/** Creates an isolated Tenant + Organisation + User (with one role assignment) directly via Prisma, bypassing the API (which has no tenant-creation endpoint). */
export async function createTestTenant(prisma: PrismaService, options: { role: string; label: string }): Promise<TestTenantFixture> {
  const suffix = randomUUID().slice(0, 8);
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, TEST_SALT_ROUNDS);
  const slug = `e2e-${options.label.toLowerCase()}-${suffix}`;

  const tenant = await prisma.tenant.create({ data: { name: `E2E ${options.label} Tenant ${suffix}`, slug } });
  const organisation = await prisma.organisation.create({
    data: { tenantId: tenant.id, name: `E2E ${options.label} Org ${suffix}`, slug: `org-${suffix}` },
  });
  const user = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      organisationId: organisation.id,
      email: `${options.label.toLowerCase()}-${suffix}@e2e.test`,
      name: `E2E ${options.label} User`,
      passwordHash,
      isActive: true,
    },
  });
  await prisma.userRoleAssignment.create({
    data: { userId: user.id, tenantId: tenant.id, organisationId: organisation.id, role: options.role },
  });

  return { tenantId: tenant.id, organisationId: organisation.id, userId: user.id, email: user.email };
}

/**
 * Tears down everything created by createTestTenant. Explicit per-table deletes rather than relying
 * on cascade — several relations are `ON DELETE RESTRICT`, not `CASCADE`, so those rows must go
 * first regardless: AuditEvent -> User, Assessment -> Organisation/User, and AssessmentTemplate ->
 * Framework (which in turn blocks Framework's own `ON DELETE CASCADE` from `tenants` from ever
 * firing while a template still references it). Assessment's own children (AssessmentItem,
 * AssessmentHistory, Evidence) *are* `ON DELETE CASCADE` from Assessment, so deleting Assessment
 * rows here is enough to take those with it.
 */
export async function cleanupTestTenant(prisma: PrismaService, tenantId: string): Promise<void> {
  await prisma.auditEvent.deleteMany({ where: { tenantId } });
  await prisma.risk.deleteMany({ where: { tenantId } });
  await prisma.remediationInitiative.deleteMany({ where: { tenantId } });
  await prisma.assessment.deleteMany({ where: { tenantId } });
  await prisma.assessmentTemplate.deleteMany({ where: { framework: { tenantId } } });
  await prisma.userRoleAssignment.deleteMany({ where: { tenantId } });
  await prisma.user.deleteMany({ where: { tenantId } });
  await prisma.organisation.deleteMany({ where: { tenantId } });
  await prisma.tenant.delete({ where: { id: tenantId } });
}
