import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app.module.js';
import { loadEnvironment } from './config/environment.js';
import { registerPublicApplicationHttpTransport } from './public-applications/public-application-http-transport.js';

async function bootstrap(): Promise<void> {
  const environment = loadEnvironment();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { cors: false });
  registerPublicApplicationHttpTransport(app, environment.PUBLIC_APPLICATION_JSON_LIMIT);

  app.enableCors({
    origin: environment.API_CORS_ORIGIN,
    credentials: true,
  });

  await app.listen(environment.API_PORT, environment.API_HOST);
}

await bootstrap();
