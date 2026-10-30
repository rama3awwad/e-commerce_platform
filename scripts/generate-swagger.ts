/**
 * Generates the OpenAPI document (swagger.json) without needing a database.
 * Mirrors the setup in src/main.ts (prefix, versioning, DocumentBuilder).
 * Used only for verification in CI / sandbox.
 */
import { Test } from '@nestjs/testing';
import { NestFactory } from '@nestjs/core';
import { VersioningType } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as fs from 'fs';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

async function main() {
  const stub = {
    $connect: async () => undefined,
    $disconnect: async () => undefined,
    $on: () => undefined,
  };

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(stub)
    .compile();

  const app = moduleRef.createNestApplication({ logger: false });

  // ===== Same global setup as main.ts =====
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.setGlobalPrefix('api', { exclude: ['/health'] });

  const config = new DocumentBuilder()
    .setTitle('Restaurant Ordering Platform API')
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'JWT-auth')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  fs.writeFileSync('/tmp/swagger-check/swagger.json', JSON.stringify(document, null, 2));

  await app.close();
  console.log('OK: swagger.json generated');
}

main().catch((e) => {
  console.error('FAILED:', e?.message || e);
  process.exit(1);
});
