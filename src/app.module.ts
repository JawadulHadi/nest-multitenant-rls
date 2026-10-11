import { DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Pool } from 'pg';
import { ApiController } from './api.controller';
import { Db } from './db';
import { ErrorsFilter } from './errors.filter';
import { TenantGuard } from './tenant.guard';

export interface AppOptions {
  databaseUrl: string; // must be the restricted app_user connection
  tokenSecret: string;
  poolMax?: number;
}

@Module({})
export class AppModule {
  static register(opts: AppOptions): DynamicModule {
    return {
      module: AppModule,
      controllers: [ApiController],
      providers: [
        TenantGuard,
        { provide: 'TOKEN_SECRET', useValue: opts.tokenSecret },
        { provide: Db, useFactory: () => new Db(new Pool({ connectionString: opts.databaseUrl, max: opts.poolMax ?? 10 })) },
        { provide: APP_FILTER, useClass: ErrorsFilter },
      ],
    };
  }
}
