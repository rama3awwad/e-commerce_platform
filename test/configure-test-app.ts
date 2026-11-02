import { INestApplication } from '@nestjs/common';
import { configureApp } from '../src/configure-app';

export async function createTestApp(app: INestApplication) {
  configureApp(app);
  await app.init();
  return app;
}
