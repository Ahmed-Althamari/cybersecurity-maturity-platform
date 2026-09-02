import { randomUUID } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Verifies EXECUTIVE_VIEWER's dashboard-only restriction (docs/threat-model.md
 * ranked gap #4) end-to-end, over real HTTP against the real app -- not just
 * that @ExecutiveDashboardAccessible() metadata is present (see
 * executive-dashboard-accessible.wiring.spec.ts for that), but that the
 * guard actually fires on a real request. This is the exact class of bug a
 * metadata-only test would miss: an earlier version of this guard was
 * registered as a global APP_GUARD, which runs *before* JwtAuthGuard
 * populates `request.user` -- every unit test passed, but a real
 * EXECUTIVE_VIEWER-only token got a real 200 (not 403) from GET
 * /assessments/:id and GET /users. Only this kind of live, real-HTTP test
 * catches that. See JwtAuthGuard's own comment for the fix.
 *
 * Requires a reachable DATABASE_URL and the seeded demo tenant (see
 * packages/database/prisma/seed.ts) -- reuses ciso@example.local's tenant/
 * organisation rather than creating a whole new one, since it only needs an
 * existing assessment to point the dashboard endpoints at.
 */
describe('EXECUTIVE_VIEWER dashboard-only scope (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  const demoPassword = process.env.DEMO_USER_PASSWORD || 'DemoPassword123!';
  const execEmail = `exec-viewer-${randomUUID()}@e2e-test.local`;
  const execPassword = 'ExecViewerPassword123!';

  let tenantId: string;
  let organisationId: string | null;
  let assessmentId: string;
  let execUserId: string;

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

    const ciso = await prisma.user.findFirstOrThrow({ where: { email: 'ciso@example.local' } });
    tenantId = ciso.tenantId;
    organisationId = ciso.organisationId;

    const assessment = await prisma.assessment.findFirstOrThrow({ where: { tenantId } });
    assessmentId = assessment.id;

    const passwordHash = await bcrypt.hash(execPassword, 10);
    const execUser = await prisma.user.create({
      data: {
        email: execEmail,
        name: 'E2E Executive Viewer',
        passwordHash,
        tenantId,
        organisationId,
        userRoleAssignments: {
          create: { role: 'EXECUTIVE_VIEWER', tenantId, organisationId },
        },
      },
    });
    execUserId = execUser.id;
  });

  afterAll(async () => {
    await prisma.auditEvent.deleteMany({ where: { userId: execUserId } });
    await prisma.userRoleAssignment.deleteMany({ where: { userId: execUserId } });
    await prisma.user.delete({ where: { id: execUserId } });
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

  async function getAs(token: string, path: string): Promise<number> {
    const res = await fetch(`${baseUrl}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    return res.status;
  }

  it('allows the executive dashboard surface: the assessment list (to pick one) and every dashboard sub-route', async () => {
    const token = await login(execEmail, execPassword);
    expect(await getAs(token, '/assessments')).toBe(200);
    expect(await getAs(token, `/assessments/${assessmentId}/dashboard`)).toBe(200);
    expect(await getAs(token, `/assessments/${assessmentId}/dashboard/maturity-overview`)).toBe(200);
    expect(await getAs(token, `/assessments/${assessmentId}/dashboard/functions`)).toBe(200);
    expect(await getAs(token, `/assessments/${assessmentId}/dashboard/gaps`)).toBe(200);
    expect(await getAs(token, `/assessments/${assessmentId}/dashboard/heatmap`)).toBe(200);
    expect(await getAs(token, `/assessments/${assessmentId}/dashboard/risks`)).toBe(200);
    expect(await getAs(token, `/assessments/${assessmentId}/dashboard/roadmap`)).toBe(200);
  });

  it('allows session-lifecycle routes regardless of the dashboard-only restriction', async () => {
    const token = await login(execEmail, execPassword);
    expect(await getAs(token, '/auth/me')).toBe(200);
    const res = await fetch(`${baseUrl}/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(201);
  });

  it('denies everything outside the executive dashboard with 403, not 200 or 404', async () => {
    const token = await login(execEmail, execPassword);
    // The raw assessment (every item/answer/rationale) is deliberately NOT
    // part of "the dashboard" -- that's the exact distinction
    // docs/architecture.md draws between EXECUTIVE_VIEWER and READ_ONLY_VIEWER.
    expect(await getAs(token, `/assessments/${assessmentId}`)).toBe(403);
    expect(await getAs(token, `/assessments/${assessmentId}/history`)).toBe(403);
    expect(await getAs(token, '/risks')).toBe(403);
    expect(await getAs(token, '/users')).toBe(403);
    expect(await getAs(token, '/initiatives/timeline')).toBe(403);
    expect(await getAs(token, '/audit-events/summary')).toBe(403);
    expect(await getAs(token, '/frameworks')).toBe(403);
  });

  it('keeps full access for a user who holds EXECUTIVE_VIEWER alongside a broader role', async () => {
    await prisma.userRoleAssignment.create({
      data: { userId: execUserId, role: 'GRC_MANAGER', tenantId, organisationId },
    });
    const token = await login(execEmail, execPassword);
    expect(await getAs(token, '/risks')).toBe(200);
    expect(await getAs(token, `/assessments/${assessmentId}`)).toBe(200);
    await prisma.userRoleAssignment.deleteMany({ where: { userId: execUserId, role: 'GRC_MANAGER' } });
  });
});
