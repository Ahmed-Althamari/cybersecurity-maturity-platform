import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { Request, Response, NextFunction } from 'express';

import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global prefix — health stays unprefixed so container/orchestrator probes have a stable path
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

  // Security headers
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
  });

  // Swagger UI is a schema of every route this API exposes — genuinely useful in dev/staging,
  // but not something to publish unauthenticated by default on a security product's production
  // deployment. Gate it behind an explicit opt-in rather than "not production", so it's a
  // deliberate choice either way instead of a NODE_ENV side effect.
  if (process.env.ENABLE_SWAGGER === 'true') {
    const config = new DocumentBuilder()
      .setTitle('CMMP API')
      .setDescription('Cybersecurity Maturity Management Platform — REST API')
      .setVersion('1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = process.env.PORT || 3001;
  await app.listen(port);

  console.log(`✅ API listening on port ${port}`);
  console.log(`📚 API available at http://localhost:${port}/api/v1`);
  if (process.env.ENABLE_SWAGGER === 'true') {
    console.log(`📖 Swagger UI at http://localhost:${port}/api/docs`);
  }
}

bootstrap().catch((error) => {
  console.error('❌ Application startup error:', error);
  process.exit(1);
});
