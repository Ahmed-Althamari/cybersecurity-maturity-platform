import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { validateEnv } from './config/validate-env';

async function bootstrap() {
  // Fails fast (before the DI container is even built) if NODE_ENV=production
  // and JWT_SECRET is unset or still the JwtModule/JwtStrategy hardcoded
  // placeholder -- see validate-env.ts.
  validateEnv();

  const app = await NestFactory.create(AppModule);

  // Global prefix -- /health is excluded so container orchestrators and
  // load balancers can probe it without an /api/v1 path or a token.
  app.setGlobalPrefix('api/v1', { exclude: ['health'] });

  // Validation pipe
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

  // CORS configuration
  app.enableCors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Security headers. This is a pure JSON API -- it never renders HTML or
  // serves a script/stylesheet of its own -- so the CSP is deliberately
  // maximal: default-src/frame-ancestors 'none' blocks everything, on the
  // off chance a response is ever rendered as HTML by a misconfigured or
  // buggy client (an error page, a misread Content-Type). Replaces a
  // hand-rolled X-Content-Type-Options/X-Frame-Options/X-XSS-Protection
  // middleware that had no HSTS, CSP, or Referrer-Policy at all (a known,
  // documented gap -- see docs/security-architecture.md). X-XSS-Protection
  // is deliberately NOT re-added: it's a deprecated header removed from
  // every modern browser's actual XSS filter, dropped from helmet's own
  // defaults since v6, and superseded by the CSP below.
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

  const port = process.env.PORT || 3001;
  await app.listen(port);

  console.log(`✅ API listening on port ${port}`);
  console.log(`📚 API available at http://localhost:${port}/api/v1`);
}

bootstrap().catch((error) => {
  console.error('❌ Application startup error:', error);
  process.exit(1);
});
