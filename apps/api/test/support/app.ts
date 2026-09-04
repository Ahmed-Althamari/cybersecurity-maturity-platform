import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AppModule } from '../../src/app.module';

/**
 * Boots the real AppModule (real Postgres via PrismaService, real
 * JwtModule, the real global AuditInterceptor) behind supertest, mirroring
 * main.ts's bootstrap so these tests exercise the actual HTTP/guard/
 * interceptor stack rather than a mocked one — the audit-log role-gating
 * bug found during Phase 13's live testing was exactly the kind of thing
 * a service-level unit test can't catch.
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
