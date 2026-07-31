import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app.module.js';
import { loadEnvironment } from './config/environment.js';

async function bootstrap(): Promise<void> {
  const environment = loadEnvironment();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { cors: false });
  app.useBodyParser('json', { limit: environment.PUBLIC_APPLICATION_JSON_LIMIT });

  app.enableCors({
    origin: environment.API_CORS_ORIGIN,
    credentials: true,
  });

  await app.listen(environment.API_PORT, environment.API_HOST);
}

await bootstrap();
