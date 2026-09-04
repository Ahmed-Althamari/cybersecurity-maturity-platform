import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AppModule } from '../../src/app.module';

/**
 * Boots the real AppModule (real Postgres via PrismaService, real
 * JwtModule, the real global AuditInterceptor, the real ThrottlerGuard)
 * behind supertest, mirroring main.ts's bootstrap so these tests exercise
 * the actual HTTP/guard/interceptor stack rather than a mocked one — the
 * audit-log role-gating bug found during Phase 13's live testing was
 * exactly the kind of thing a service-level unit test can't catch.
 *
 * There is deliberately no attempt here to bypass rate limiting.
 * `.overrideGuard()`/`.overrideProvider()` on `@nestjs/testing`'s
 * `Test.createTestingModule()` do **not** reliably intercept a guard
 * registered globally via `{ provide: APP_GUARD, useClass: ... }`
 * (confirmed the hard way: an override that logs on every call never
 * fired once, while the real 5/min login throttle fired for real and
 * failed a test) — a known NestJS testing limitation, not a bug in this
 * repo's guard. So instead: every spec file using this helper gets its
 * own fresh app instance (and therefore its own empty in-memory
 * ThrottlerStorage), and keeps its own total `POST /auth/login` calls
 * comfortably under the real limit rather than fighting it. Files that
 * need to log in more than a few times belong in their own spec file for
 * exactly this reason — see test/token-revocation.e2e-spec.ts.
 * apps/api/test/rate-limit.e2e-spec.ts is the one place the throttle's
 * actual behavior gets deliberately exercised, with its own bootstrap.
 */
export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
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
