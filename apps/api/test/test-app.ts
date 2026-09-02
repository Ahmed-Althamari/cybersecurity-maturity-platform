import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import helmet from 'helmet';

import { AppModule } from '../src/app.module';

/**
 * Configures a NestJS testing app identically to main.ts's bootstrap() --
 * global prefix, ValidationPipe, CORS, and helmet -- so every integration
 * spec exercises the same middleware stack production actually runs, not
 * a hand-trimmed subset that silently drifts from it. This replaces each
 * integration spec's own copy-pasted setup, which is exactly how
 * security-headers.integration-spec.ts's first draft went wrong: it
 * asserted on helmet's headers without adding `app.use(helmet(...))` to
 * its own manually-assembled test app, since that line lived only in
 * main.ts, not here. Does NOT call validateEnv() (tests don't want a
 * production secret check) or app.listen() -- callers still pick their
 * own port (usually 0) and read it back off app.getHttpServer().
 */
export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();

  app.setGlobalPrefix('api/v1', { exclude: ['health'] });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  app.enableCors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
      },
      referrerPolicy: { policy: 'no-referrer' },
      frameguard: { action: 'deny' },
    }),
  );

  return app;
}
