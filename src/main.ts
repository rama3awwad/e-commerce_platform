import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  const port = Number(process.env.PORT || 3000);
  await app.listen(port);
  new Logger('Bootstrap').log(`API listening on http://localhost:${port}/api/v1`);
}
bootstrap();
