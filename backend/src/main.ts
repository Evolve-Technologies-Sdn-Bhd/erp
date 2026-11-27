import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import type { Env } from './config/env';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Behind a web server on the same machine (nginx), the visitor's own address comes in X-Forwarded-For. Without this
  // every visitor looks like 127.0.0.1, and sign-in's lockout per network address would lock everyone out together.
  const trustProxy = process.env.TRUST_PROXY?.trim();
  if (trustProxy) app.set('trust proxy', trustProxy === 'on' ? 'loopback' : trustProxy);
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  configureApp(app);
  app.enableShutdownHooks();

  const port = config.get('PORT', { infer: true });
  await app.listen(port);
  Logger.log(`API ready on http://localhost:${port}/api/v1 (AUTH_MODE=${config.get('AUTH_MODE', { infer: true })})`, 'Bootstrap');
}

void bootstrap();
