import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

import { cleanupTestTenant, createTestTenant, TEST_PASSWORD, type TestTenantFixture } from './support/fixtures';

/**
 * Deliberately does NOT use test/support/app.ts's createTestApp() — that
 * helper overrides ThrottlerGuard to always allow (every other e2e suite
 * logs in several times per file and would otherwise trip the same limit
 * this file exists to verify). This is the one place the real guard runs.
 */
async function createUnthrottledTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api/v1', { exclude: ['health'] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();
  return app;
}

describe('Rate limiting (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fixture: TestTenantFixture;

  beforeAll(async () => {
    app = await createUnthrottledTestApp();
    prisma = app.get(PrismaService);
    fixture = await createTestTenant(prisma, { role: 'CISO', label: 'RateLimit' });
  });

  afterAll(async () => {
    await cleanupTestTenant(prisma, fixture.tenantId);
    await app.close();
  });

  it('allows 5 login attempts per minute and then blocks the 6th with 429', async () => {
    for (let i = 0; i < 5; i++) {
      // Wrong password on purpose — a 401 still counts against the throttle bucket, and using
      // the real fixture's email keeps this realistic without ever actually locking the account.
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: fixture.email, password: 'DefinitelyWrongPassword123!' })
        .expect(401);
    }

    const blocked = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: fixture.email, password: TEST_PASSWORD })
      .expect(429);

    expect(blocked.headers['retry-after']).toBeDefined();
  });

  it('never throttles /health, even after login has been exhausted above', async () => {
    await request(app.getHttpServer()).get('/health').expect(200);
  });
});
