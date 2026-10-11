import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { isUuid } from './token';

@Injectable()
export class Db implements OnModuleInit, OnModuleDestroy {
  constructor(readonly pool: Pool) {}

  /** Refuse to start if this connection could bypass row-level security. */
  async onModuleInit() {
    const { rows } = await this.pool.query(
      'select rolsuper, rolbypassrls from pg_roles where rolname = current_user',
    );
    if (rows[0]?.rolsuper || rows[0]?.rolbypassrls) {
      throw new Error('database role bypasses row-level security: connect as a plain role such as app_user');
    }
  }

  async onModuleDestroy() {
    await this.pool.end();
  }

  /**
   * Run fn inside a transaction scoped to one tenant. set_config(..., true) is transaction-local,
   * so the tenant can never leak to the next request that reuses this pooled connection.
   */
  async withTenant<T>(orgId: string, fn: (c: PoolClient) => Promise<T>): Promise<T> {
    if (!isUuid(orgId)) throw new Error('invalid org id');
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      await client.query("select set_config('app.org_id', $1, true)", [orgId]);
      const result = await fn(client);
      await client.query('commit');
      return result;
    } catch (e) {
      await client.query('rollback').catch(() => undefined);
      throw e;
    } finally {
      client.release();
    }
  }
}
