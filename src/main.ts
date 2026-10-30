import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { Logger } from '@nestjs/common';

const logger = new Logger('Bootstrap');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ===== Security =====
  // Helmet for security headers
  app.use(helmet());

  // CORS configuration
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') || '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true,
  });

  // ===== Global Pipes =====
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

  // ===== Global Filters =====
  app.useGlobalFilters(new AllExceptionsFilter());

  // ===== Global Interceptors =====
  app.useGlobalInterceptors(new TransformInterceptor());

  // ===== API Versioning =====
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // ===== API Prefix =====
  app.setGlobalPrefix('api', {
    exclude: ['/health'],
  });

  // ===== Swagger Documentation =====
  const config = new DocumentBuilder()
    .setTitle('Restaurant Ordering Platform API')
    .setDescription(
      [
        'A comprehensive REST API for a restaurant ordering platform (Internet Tech Club 2026 — Basic Track).',
        '',
        '## 📦 Unified Response Format',
        '**All successful responses** are wrapped in the same envelope:',
        '```json',
        '{ "success": true, "data": { ... }, "timestamp": "2026-10-27T12:00:00.000Z" }',
        '```',
        '',
        '**All error responses** follow this format:',
        '```json',
        '{ "statusCode": 400, "message": "...", "error": "Bad Request", "timestamp": "...", "path": "..." }',
        '```',
        '⚠️ Note: for validation errors (400), `message` is an **array of strings** — build one global error handler for the whole frontend.',
        '',
        '## 🔐 Authentication',
        '1. Call `/auth/register` or `/auth/login` → receive `accessToken`',
        '2. Click the **Authorize** button (🔒) and paste ONLY the token (Swagger adds "Bearer " automatically)',
        '3. Send the token on every protected request: `Authorization: Bearer <token>`',
        '',
        '## 🧪 How to test in Swagger UI (step by step)',
        '1. Find the endpoint → click **Try it out**',
        '2. Fill the request body / params (examples are pre-filled)',
        '3. Click **Execute** → check the **Server response** below (code + body)',
        '4. Copy `data.accessToken` from the login response',
        '5. Click 🔒 **Authorize** → paste the token → now protected endpoints work',
        '',
        '**Seeded test accounts** (password for both: `Admin@123`):',
        '- Admin: `admin@restaurant.com` / username: `admin`',
        '- Customer: `customer@test.com` / username: `testcustomer`',
        '',
        '**Response code meanings**: 200 OK · 201 Created · 400 validation error (message = array) · 401 no/bad token · 403 role not allowed · 404 not found · 409 duplicate email/username · 429 too many requests.',
        '',
        '## 📖 Full testing session guide',
        'See `docs/SWAGGER-GUIDE.md` in the project — a complete walkthrough of every endpoint, in order, with expected responses.',
        '',
        '## 🛡️ Roles Hierarchy',
        '`CUSTOMER` < `ADMIN` — each endpoint documents its required role(s).',
        '',
        '## ⚠️ Protection Mechanisms',
        '- **Rate limiting**: requests are throttled per IP (429 when exceeded)',
        '- **Account lockout**: 5 failed logins → account locked for 15 minutes (403)',
        '',
        '## 🚧 Current Phase',
        '**Phase 1**: Authentication + Users management. Upcoming phases: Products, Orders, Cart, Reviews.',
      ].join('\n'),
    )
    .setVersion('1.0')
    .addServer('http://localhost:3000', 'Local development server')
    .addTag('health', 'API health check')
    .addTag('auth', 'Authentication: register, login, session')
    .addTag('users', 'User management (role-protected)')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT token (without the "Bearer " prefix)',
        in: 'header',
      },
      'JWT-auth',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    customSiteTitle: 'Restaurant API — Swagger Docs',
    swaggerOptions: {
      persistAuthorization: true, // keep the token after page reload
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
      filter: true, // search box at the top
      displayRequestDuration: true, // show request time in ms
      tryItOutEnabled: true, // "Try it out" is open by default
      defaultModelsExpandDepth: -1, // hide the models section at the bottom
    },
  });

  // ===== Start Server =====
  const port = process.env.PORT || 3000;
  await app.listen(port);
  logger.log(`🚀 Server running on http://localhost:${port}`);
  logger.log(`📖 Swagger docs at http://localhost:${port}/api/docs`);
}

bootstrap();
