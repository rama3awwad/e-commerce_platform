import { INestApplication } from '@nestjs/common';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import { configureApp } from '../src/configure-app';
import { ConfigService } from '@nestjs/config';
import { UsersPrismaService } from '../src/users/prisma/users-prisma.service';
import { ProductsPrismaService } from '../src/products/prisma/products-prisma.service';
import { OrdersPrismaService } from '../src/orders/prisma/orders-prisma.service';
import { NotificationsPrismaService } from '../src/notifications/prisma/notifications-prisma.service';
export function overridePrismaProviders(builder: TestingModuleBuilder, stubs: { users: unknown; products: unknown; orders: unknown; notifications: unknown }) { return builder.overrideProvider(UsersPrismaService).useValue(stubs.users).overrideProvider(ProductsPrismaService).useValue(stubs.products).overrideProvider(OrdersPrismaService).useValue(stubs.orders).overrideProvider(NotificationsPrismaService).useValue(stubs.notifications); }
export async function createTestApp(app: INestApplication) { configureApp(app); await app.init(); return app; }

export async function listenInternalApiUrls(app: INestApplication) { await app.listen(0); const address=app.getHttpServer().address(); const base=`http://127.0.0.1:${address.port}/api/v1`; const config=app.get(ConfigService); for(const key of ['USERS_API_URL','PRODUCTS_API_URL','ORDERS_API_URL','NOTIFICATIONS_API_URL']) config.set(key,base); return base; }
