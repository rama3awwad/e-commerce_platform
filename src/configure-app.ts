import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import express = require('express');
import { join } from 'path';
import { mkdirSync } from 'fs';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

export function configureApp(app: INestApplication) {
  app.use(helmet());
  app.enableCors({ origin: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map((x) => x.trim()), methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'], credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } }));
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new TransformInterceptor());
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.setGlobalPrefix('api');

  const uploadDir = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');
  mkdirSync(uploadDir, { recursive: true });
  app.use('/uploads', express.static(uploadDir));

  const config = new DocumentBuilder()
    .setTitle('E-Commerce Platform API')
    .setDescription([
      'Requirement 1 REST API: authentication, users, product catalog, orders, notifications and inventory adapter seam.',
      '',
      'Success: `{ success: true, data, timestamp }`. Errors: `{ statusCode, code, message, error, timestamp, path }`.',
      'JWT bearer authentication. CUSTOMER can create orders and access their own records. ADMIN manages products and order status.',
      'Seed accounts use password `Admin@123`: admin@store.com, customer@test.com, customer2@test.com.',
      'Error codes: VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, CONFLICT, TOO_MANY_REQUESTS, INSUFFICIENT_STOCK, INVALID_STATUS_TRANSITION, INVENTORY_UNAVAILABLE, INTERNAL_ERROR.',
      'Images are served from `/uploads/*`. Inventory currently uses an in-memory stub; Requirement 2 may replace the provider behind InventoryPort.',
    ].join('\n'))
    .setVersion('1.0')
    .addServer('http://localhost:3000', 'Local development server')
    .addTag('health', 'Health check')
    .addTag('auth', 'Authentication')
    .addTag('users', 'User administration')
    .addTag('categories', 'Product categories')
    .addTag('products', 'Product catalog and images')
    .addTag('orders', 'Order creation and lifecycle')
    .addTag('notifications', 'User notifications')
    .addTag('inventory', 'Inventory provider seam and admin stock stub')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'JWT-auth')
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config), { swaggerOptions: { persistAuthorization: true, filter: true, displayRequestDuration: true } });
}
