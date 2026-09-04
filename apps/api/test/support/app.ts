import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';

import { AppModule } from '../../src/app.module';

/**
 * Boots the real AppModule (real Postgres via PrismaService, real
 * JwtModule, the real global AuditInterceptor) behind supertest, mirroring
 * main.ts's bootstrap so these tests exercise the actual HTTP/guard/
 * interceptor stack rather than a mocked one — the audit-log role-gating
 * bug found during Phase 13's live testing was exactly the kind of thing
 * a service-level unit test can't catch.
 *
 * ThrottlerGuard is overridden to always allow: these suites log in
 * several times per file (different fixtures, different roles) against
 * the tight 5/minute limit login carries in production, and rate
 * limiting itself isn't what auth/tenant-isolation/authorization e2e
 * tests exist to verify — it's tested by inspection of the config, not
 * by deliberately tripping it here.
 */
export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideGuard(ThrottlerGuard)
    .useValue({ canActivate: () => true })
    .compile();
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  await app.init();
  return app;
}
