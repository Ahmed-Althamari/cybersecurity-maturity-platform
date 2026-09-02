import { randomUUID } from 'crypto';

import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

import { PrismaService } from '../src/prisma/prisma.service';

import { createTestApp } from './test-app';

/**
 * Verifies POST /auth/change-password end-to-end against the real running
 * app and a real Postgres database -- not just that AuthService computes
 * the right bcrypt hash / DB call in isolation (see auth.service.spec.ts),
 * but that changing a password actually revokes every other outstanding
 * token for that user on the very next request, which is the whole point
 * of this endpoint (docs/threat-model.md's last remaining token-revocation
 * gap: "no password-change-triggered revocation"). Uses its own throwaway
 * tenant/org/user rather than the shared seeded demo tenant, since this
 * suite mutates the user's password.
 */
describe('POST /auth/change-password (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  let tenantId: string;
  let orgId: string;
  const userEmail = `change-password-${randomUUID()}@e2e-test.local`;
  const originalPassword = 'OriginalPassword123!';

  beforeAll(async () => {
    app = await createTestApp();
    await app.listen(0);
    const address = app.getHttpServer().address();
    baseUrl = `http://127.0.0.1:${address.port}/api/v1`;

    prisma = app.get(PrismaService);

    const tenant = await prisma.tenant.create({
      data: { name: 'E2E Change-Password Tenant', slug: `e2e-change-password-${randomUUID()}` },
    });
    tenantId = tenant.id;

    const org = await prisma.organisation.create({
      data: { name: 'E2E Org', slug: `e2e-org-${randomUUID()}`, tenantId },
    });
    orgId = org.id;

    const passwordHash = await bcrypt.hash(originalPassword, 10);
    await prisma.user.create({
      data: {
        email: userEmail,
        name: 'Change Password Test User',
        passwordHash,
        tenantId,
        organisationId: orgId,
        userRoleAssignments: { create: { role: 'CISO', tenantId, organisationId: orgId } },
      },
    });
  });

  afterAll(async () => {
    await prisma.auditEvent.deleteMany({ where: { tenantId } });
    await prisma.userRoleAssignment.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.organisation.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
    await app.close();
  });

  async function login(password: string): Promise<string> {
    const res = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userEmail, password }),
    });
    if (res.status !== 201) {
      throw new Error(`login failed: ${res.status} ${await res.text()}`);
    }
    const body = await res.json();
    return body.access_token as string;
  }

  it('rejects the wrong current password and leaves the account untouched', async () => {
    const token = await login(originalPassword);

    const res = await fetch(`${baseUrl}/auth/change-password`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: 'totally-wrong', newPassword: 'WouldBeNewPassword123!' }),
    });
    expect(res.status).toBe(401);

    // Original password still works -- nothing was changed.
    await expect(login(originalPassword)).resolves.toEqual(expect.any(String));
  });

  it('rejects a new password shorter than the platform minimum', async () => {
    const token = await login(originalPassword);

    const res = await fetch(`${baseUrl}/auth/change-password`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: originalPassword, newPassword: 'short' }),
    });
    expect(res.status).toBe(400);
  });

  it('changes the password, revokes every other outstanding token, and returns a working fresh one', async () => {
    const tokenA = await login(originalPassword);
    const tokenB = await login(originalPassword);

    const newPassword = 'BrandNewPassword123!';
    const changeRes = await fetch(`${baseUrl}/auth/change-password`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: originalPassword, newPassword }),
    });
    expect(changeRes.status).toBe(201);
    const { access_token: freshToken } = await changeRes.json();
    expect(freshToken).toEqual(expect.any(String));

    // The token used to make the change is itself now stale (issued before
    // passwordChangedAt) -- confirms this isn't just per-jti revocation
    // like logout, but a wholesale cutoff of every previously issued token.
    const usingTokenA = await fetch(`${baseUrl}/auth/me`, { headers: { Authorization: `Bearer ${tokenA}` } });
    expect(usingTokenA.status).toBe(401);

    // A *different* session's token, never presented to change-password at
    // all, is also revoked -- this is the "all outstanding tokens" part.
    const usingTokenB = await fetch(`${baseUrl}/auth/me`, { headers: { Authorization: `Bearer ${tokenB}` } });
    expect(usingTokenB.status).toBe(401);

    // The freshly minted token from the change-password response itself
    // still works.
    const usingFreshToken = await fetch(`${baseUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${freshToken}` },
    });
    expect(usingFreshToken.status).toBe(200);

    // The old password no longer authenticates; the new one does.
    await expect(login(originalPassword)).rejects.toThrow();
    await expect(login(newPassword)).resolves.toEqual(expect.any(String));
  });
});
