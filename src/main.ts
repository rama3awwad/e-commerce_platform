import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
 // app.enableShutdownHooks();
  const port = Number(process.env.PORT || 3000);
  await app.listen(port);
const logger = new Logger('Bootstrap');
const server = app.getHttpServer();
let closing = false;
const shutdown = async (signal: string) => {
  if (closing) return;
  closing = true;
  logger.log(`${signal}: draining in-flight requests`);
  const force = setTimeout(() => { logger.error('Forced exit after 8s'); process.exit(1); }, 8000);
  force.unref();
  try {
    await new Promise<void>((resolve) => server.close(() => resolve())); // يوقف الاستقبال وينتظر الجارية
    await app.close();                                                   // بعدها Prisma/Redis/RabbitMQ
    process.exit(0);
  } catch (e) { logger.error(`Shutdown failed: ${(e as Error).message}`); process.exit(1); }
};
process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));
}
bootstrap();
