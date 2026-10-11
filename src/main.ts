import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const databaseUrl = process.env.DATABASE_URL;
  const tokenSecret = process.env.TOKEN_SECRET;
  if (!databaseUrl || !tokenSecret || tokenSecret.length < 16) {
    throw new Error('set DATABASE_URL (app_user) and TOKEN_SECRET (16+ characters)');
  }
  const app = await NestFactory.create(AppModule.register({ databaseUrl, tokenSecret }));
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT ?? 3000));
}
void bootstrap();
