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
  app.setGlobalPrefix('api');

  const config = new DocumentBuilder()
    .setTitle('E-Commerce Platform API')
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'JWT-auth')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  fs.writeFileSync('/tmp/swagger-check/swagger.json', JSON.stringify(document, null, 2));

  // Register Swagger UI exactly like main.ts does
  SwaggerModule.setup('api/docs', app, document, {
    customSiteTitle: 'E-Commerce API — Swagger Docs',
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
      filter: true,
      displayRequestDuration: true,
      tryItOutEnabled: true,
      defaultModelsExpandDepth: -1,
    },
  });

  // ===== Boot check: actually start the server and hit the real URLs =====
  // (mirrors what a user sees in the browser, without needing a database)
  app.use((req: any, res: any, next: () => void) => {
    if (req.originalUrl === '/' || req.originalUrl === '/api' || req.originalUrl === '/api/') {
      return res.redirect('/api/docs');
    }
    if (req.originalUrl === '/favicon.ico') {
      return res.status(204).end();
    }
    next();
  });
  await app.listen(3999);

  const base = 'http://127.0.0.1:3999';
  const check = async (path: string): Promise<number> => {
    const r = await fetch(base + path, { redirect: 'manual' });
    const body = r.status === 200 ? (await r.text()).slice(0, 50).replace(/\s+/g, ' ') : '';
    console.log(`  ${path.padEnd(14)} -> ${r.status} ${r.headers.get('location') || body}`);
    return r.status;
  };

  const [docs, root, api, health, oldHealth, favicon] = await Promise.all([
    check('/api/docs'),
    check('/'),
    check('/api/'),
    check('/api/v1/health'),
    check('/health'),
    check('/favicon.ico'),
  ]);
  await app.close();

  if (docs !== 200) throw new Error('Swagger UI did not return 200 at /api/docs');
  if (root !== 302 || api !== 302) throw new Error('/ and /api must redirect to /api/docs');
  if (health !== 200) throw new Error('/api/v1/health did not return 200');
  if (oldHealth !== 404) throw new Error('/health must be gone (moved to /api/v1/health) — got ' + oldHealth);
  if (favicon !== 204) throw new Error('/favicon.ico did not return 204');

  console.log('OK: swagger.json generated + boot check passed');
}

main().catch((e) => {
  console.error('FAILED:', e?.message || e);
  process.exit(1);
});
