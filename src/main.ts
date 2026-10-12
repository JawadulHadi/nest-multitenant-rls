import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const databaseUrl = process.env.DATABASE_URL;
  const tokenSecret = process.env.TOKEN_SECRET;
  if (!databaseUrl || !tokenSecret || tokenSecret.length < 16) {
    throw new Error('set DATABASE_URL (app_user) and TOKEN_SECRET (16+ characters)');
  }
  // Serverless hosts (Vercel) run many small instances: keep each pool small there (e.g. 2).
  const poolMax = Number(process.env.DB_POOL_MAX || 10);
  if (!Number.isInteger(poolMax) || poolMax < 1) throw new Error('DB_POOL_MAX must be a positive integer');
  const app = await NestFactory.create(AppModule.register({ databaseUrl, tokenSecret, poolMax }));
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT ?? 3000));
}
void bootstrap();
