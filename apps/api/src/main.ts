import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module.js';
import { loadEnvironment } from './config/environment.js';

async function bootstrap(): Promise<void> {
  const environment = loadEnvironment();
  const app = await NestFactory.create(AppModule, { cors: false });

  app.enableCors({
    origin: environment.API_CORS_ORIGIN,
  });

  await app.listen(environment.API_PORT, environment.API_HOST);
}

await bootstrap();
