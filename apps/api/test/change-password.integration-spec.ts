import { randomUUID } from 'crypto';

import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

import { PrismaService } from '../src/prisma/prisma.service';

import { createTestApp } from './support/app';

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
 *
 * Each `describe` below gets its OWN app instance (and therefore its own
 * empty in-memory ThrottlerStorage) rather than sharing one across every
 * test in the file -- same reasoning as apps/api/test/support/app.ts's own
 * doc comment: the real 5/min/IP login throttle is never bypassed here,
 * so the total `POST /auth/login` calls any one app instance sees must
 * stay comfortably under that limit. A single shared app across all of
 * this file's login calls (1 + 1 + 4 = 6) would exceed it.
 */
interface TestContext {
  app: INestApplication;
  prisma: PrismaService;
  baseUrl: string;
  tenantId: string;
  userEmail: string;
}

async function setUp(): Promise<TestContext> {
  const app = await createTestApp();
  await app.listen(0);
  const address = app.getHttpServer().address();
  const baseUrl = `http://127.0.0.1:${address.port}/api/v1`;

  const prisma = app.get(PrismaService);

  const tenant = await prisma.tenant.create({
    data: { name: 'E2E Change-Password Tenant', slug: `e2e-change-password-${randomUUID()}` },
  });
  const tenantId = tenant.id;

  const org = await prisma.organisation.create({
    data: { name: 'E2E Org', slug: `e2e-org-${randomUUID()}`, tenantId },
  });

  const userEmail = `change-password-${randomUUID()}@e2e-test.local`;
  const passwordHash = await bcrypt.hash('OriginalPassword123!', 10);
  await prisma.user.create({
    data: {
      email: userEmail,
      name: 'Change Password Test User',
      passwordHash,
      tenantId,
      organisationId: org.id,
      userRoleAssignments: { create: { role: 'CISO', tenantId, organisationId: org.id } },
    },
  });

  return { app, prisma, baseUrl, tenantId, userEmail };
}

async function tearDown(ctx: TestContext): Promise<void> {
  // Audit writes are fire-and-forget (AuditInterceptor never awaits them before responding —
  // see its own doc comment), so the very last request's audit row can still be in flight when
  // this runs. A short grace period avoids a flaky FK-constraint violation racing an audit_events
  // insert that lands a beat late. Deleting only the Tenant (rather than each child table
  // individually) also matters here: every one of Organisation/User/AuditEvent's own tenantId
  // relations cascades directly from Tenant, so a single delete removes all of them in one
  // statement with no manual ordering to get wrong (AuditEvent.userId is onDelete: Restrict, but
  // that arc is never invoked — its rows are gone via the tenantId cascade before User's own
  // tenantId cascade would otherwise hit that Restrict).
  await new Promise((resolve) => setTimeout(resolve, 500));
  await ctx.prisma.tenant.delete({ where: { id: ctx.tenantId } });
  await ctx.app.close();
}

function loginWith(ctx: TestContext) {
  return async function login(password: string): Promise<string> {
    const res = await fetch(`${ctx.baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ctx.userEmail, password }),
    });
    if (res.status !== 201) {
      throw new Error(`login failed: ${res.status} ${await res.text()}`);
    }
    const body = await res.json();
    return body.access_token as string;
  };
}

describe('POST /auth/change-password (integration)', () => {
  describe('rejects the wrong current password and leaves the account untouched', () => {
    let ctx: TestContext;
    beforeAll(async () => {
      ctx = await setUp();
    });
    afterAll(async () => {
      await tearDown(ctx);
    });

    it('rejects and leaves the account untouched', async () => {
      const login = loginWith(ctx);
      const token = await login('OriginalPassword123!');

      const res = await fetch(`${ctx.baseUrl}/auth/change-password`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: 'totally-wrong', newPassword: 'WouldBeNewPassword123!' }),
      });
      expect(res.status).toBe(401);

      // Original password still works -- nothing was changed.
      await expect(login('OriginalPassword123!')).resolves.toEqual(expect.any(String));
    });
  });

  describe('rejects a new password shorter than the platform minimum', () => {
    let ctx: TestContext;
    beforeAll(async () => {
      ctx = await setUp();
    });
    afterAll(async () => {
      await tearDown(ctx);
    });

    it('rejects the too-short password', async () => {
      const login = loginWith(ctx);
      const token = await login('OriginalPassword123!');

      const res = await fetch(`${ctx.baseUrl}/auth/change-password`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: 'OriginalPassword123!', newPassword: 'short' }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('changes the password, revokes every other outstanding token, and returns a working fresh one', () => {
    let ctx: TestContext;
    beforeAll(async () => {
      ctx = await setUp();
    });
    afterAll(async () => {
      await tearDown(ctx);
    });

    it('changes the password and revokes every other outstanding token', async () => {
      const login = loginWith(ctx);
      const tokenA = await login('OriginalPassword123!');
      const tokenB = await login('OriginalPassword123!');

      const newPassword = 'BrandNewPassword123!';
      const changeRes = await fetch(`${ctx.baseUrl}/auth/change-password`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenA}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: 'OriginalPassword123!', newPassword }),
      });
      expect(changeRes.status).toBe(201);
      const { access_token: freshToken } = await changeRes.json();
      expect(freshToken).toEqual(expect.any(String));

      // The token used to make the change is itself now stale (issued before
      // passwordChangedAt) -- confirms this isn't just per-jti revocation
      // like logout, but a wholesale cutoff of every previously issued token.
      const usingTokenA = await fetch(`${ctx.baseUrl}/auth/me`, { headers: { Authorization: `Bearer ${tokenA}` } });
      expect(usingTokenA.status).toBe(401);

      // A *different* session's token, never presented to change-password at
      // all, is also revoked -- this is the "all outstanding tokens" part.
      const usingTokenB = await fetch(`${ctx.baseUrl}/auth/me`, { headers: { Authorization: `Bearer ${tokenB}` } });
      expect(usingTokenB.status).toBe(401);

      // The freshly minted token from the change-password response itself
      // still works.
      const usingFreshToken = await fetch(`${ctx.baseUrl}/auth/me`, {
        headers: { Authorization: `Bearer ${freshToken}` },
      });
      expect(usingFreshToken.status).toBe(200);

      // The old password no longer authenticates; the new one does.
      await expect(login('OriginalPassword123!')).rejects.toThrow();
      await expect(login(newPassword)).resolves.toEqual(expect.any(String));
    });
  });
});
