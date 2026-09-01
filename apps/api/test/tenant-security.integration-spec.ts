import { randomUUID } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Integration/security/tenant-isolation suite. Boots the *real* Nest
 * application (every module, every guard, every interceptor) against the
 * live local Postgres database this repo's dev workflow already uses, and
 * exercises it over real HTTP -- nothing here is mocked. This intentionally
 * requires a reachable DATABASE_URL and the seeded demo tenant (see
 * packages/database/prisma/seed.ts); run `npm run db:seed` first if it's
 * empty. Kept out of the default `npm test` (unit, fully mocked, no DB
 * required) via a separate jest.integration.config.js / `test:integration`
 * script so CI's fast path never needs a database.
 */
describe('Tenant isolation, authorization & security (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  const demoPassword = process.env.DEMO_USER_PASSWORD || 'DemoPassword123!';

  let tenantBId: string;
  let orgBId: string;
  let userBId: string;
  let riskBId: string;
  const tenantBEmail = `tenant-b-${randomUUID()}@e2e-test.local`;
  const tenantBPassword = 'TenantBPassword123!';

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

    prisma = app.get(PrismaService);

    const tenantB = await prisma.tenant.create({
      data: { name: 'E2E Tenant B', slug: `e2e-tenant-b-${randomUUID()}` },
    });
    tenantBId = tenantB.id;

    const orgB = await prisma.organisation.create({
      data: { name: 'E2E Org B', slug: `e2e-org-b-${randomUUID()}`, tenantId: tenantBId },
    });
    orgBId = orgB.id;

    const passwordHash = await bcrypt.hash(tenantBPassword, 10);
    const userB = await prisma.user.create({
      data: {
        email: tenantBEmail,
        name: 'Tenant B User',
        passwordHash,
        tenantId: tenantBId,
        organisationId: orgBId,
        userRoleAssignments: {
          create: { role: 'CISO', tenantId: tenantBId, organisationId: orgBId },
        },
      },
    });
    userBId = userB.id;

    const riskB = await prisma.risk.create({
      data: {
        tenantId: tenantBId,
        organisationId: orgBId,
        title: 'Tenant B secret risk -- must never leak to Tenant A',
        likelihood: 3,
        impact: 3,
      },
    });
    riskBId = riskB.id;
  });

  afterAll(async () => {
    // AuditEvent rows (created by this suite's own logins) reference userId
    // via a foreign key, so they must go before the user that produced them.
    await prisma.auditEvent.deleteMany({ where: { tenantId: tenantBId } });
    await prisma.risk.deleteMany({ where: { tenantId: tenantBId } });
    await prisma.userRoleAssignment.deleteMany({ where: { tenantId: tenantBId } });
    await prisma.user.deleteMany({ where: { tenantId: tenantBId } });
    await prisma.organisation.deleteMany({ where: { tenantId: tenantBId } });
    await prisma.tenant.delete({ where: { id: tenantBId } });
    await app.close();
  });

  async function login(email: string, password: string): Promise<string> {
    const res = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (res.status !== 201) {
      throw new Error(`login failed for ${email}: ${res.status} ${await res.text()}`);
    }
    const body = await res.json();
    return body.access_token as string;
  }

  it('rejects a login with the wrong password', async () => {
    const res = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: tenantBEmail, password: 'wrong-password' }),
    });
    expect(res.status).toBe(401);
  });

  it('rejects any request with no bearer token', async () => {
    const res = await fetch(`${baseUrl}/risks`);
    expect(res.status).toBe(401);
  });

  it('rejects a request with a tampered JWT signature', async () => {
    const token = await login(tenantBEmail, tenantBPassword);
    const tampered = `${token.slice(0, -4)}${token.slice(-4) === 'abcd' ? 'efgh' : 'abcd'}`;
    const res = await fetch(`${baseUrl}/risks`, { headers: { Authorization: `Bearer ${tampered}` } });
    expect(res.status).toBe(401);
  });

  it("never returns another tenant's risk in the risk register listing", async () => {
    const tokenB = await login(tenantBEmail, tenantBPassword);
    const resB = await fetch(`${baseUrl}/risks`, { headers: { Authorization: `Bearer ${tokenB}` } });
    expect(resB.status).toBe(200);
    const risksB: Array<{ id: string }> = await resB.json();
    expect(risksB.some((r) => r.id === riskBId)).toBe(true);

    const tokenA = await login('ciso@example.local', demoPassword);
    const resA = await fetch(`${baseUrl}/risks`, { headers: { Authorization: `Bearer ${tokenA}` } });
    expect(resA.status).toBe(200);
    const risksA: Array<{ id: string }> = await resA.json();
    expect(risksA.some((r) => r.id === riskBId)).toBe(false);
  });

  it("returns 404 (not the record) when fetching another tenant's risk by id directly", async () => {
    const tokenA = await login('ciso@example.local', demoPassword);
    const res = await fetch(`${baseUrl}/risks/${riskBId}`, { headers: { Authorization: `Bearer ${tokenA}` } });
    expect(res.status).toBe(404);
  });

  it('denies a non-privileged role from the audit log endpoint', async () => {
    const tokenViewer = await login('viewer@example.local', demoPassword);
    const res = await fetch(`${baseUrl}/audit-events/summary`, {
      headers: { Authorization: `Bearer ${tokenViewer}` },
    });
    expect(res.status).toBe(403);
  });

  it('allows the CISO role onto the audit log endpoint', async () => {
    const tokenCiso = await login('ciso@example.local', demoPassword);
    const res = await fetch(`${baseUrl}/audit-events/summary`, {
      headers: { Authorization: `Bearer ${tokenCiso}` },
    });
    expect(res.status).toBe(200);
  });

  it("refuses to create a risk under another tenant's organisation id", async () => {
    // Tenant A's CISO tries to create a risk quoting Tenant B's organisationId.
    const tokenA = await login('ciso@example.local', demoPassword);
    const res = await fetch(`${baseUrl}/risks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ organisationId: orgBId, title: 'Cross-tenant write attempt', likelihood: 1, impact: 1 }),
    });
    expect(res.status).toBe(404);
  });

  it('rejects an unrecognized field in the request body (mass-assignment protection)', async () => {
    const tokenA = await login('ciso@example.local', demoPassword);
    const res = await fetch(`${baseUrl}/risks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({
        organisationId: orgBId,
        title: 'Should be rejected before reaching the service',
        likelihood: 1,
        impact: 1,
        tenantId: tenantBId, // not a whitelisted DTO field -- must be rejected outright
      }),
    });
    expect(res.status).toBe(400);
  });
});
