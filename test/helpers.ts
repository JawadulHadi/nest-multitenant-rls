import { Client, Pool } from 'pg';
import { runMigrations } from '../src/migrate';

export const ADMIN_URL = process.env.TEST_ADMIN_URL ?? 'postgres://postgres:postgres@localhost:5432/postgres';
export const SECRET = 'test-secret-with-16+chars';
const DB = 'rls_test';

const withDb = (url: string, db: string, user?: string, pass?: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  if (user) { u.username = user; u.password = pass ?? ''; }
  return u.toString();
};

/** Fresh database, migrated as admin. Returns an admin pool (for seeding) and the app_user URL. */
export async function freshDatabase() {
  const root = new Client({ connectionString: ADMIN_URL });
  await root.connect();
  await root.query(`drop database if exists ${DB} with (force)`);
  await root.query(`create database ${DB}`);
  await root.end();
  const adminUrl = withDb(ADMIN_URL, DB);
  await runMigrations(adminUrl);
  const admin = new Pool({ connectionString: adminUrl, max: 2 });
  return { admin, adminUrl, appUrl: withDb(ADMIN_URL, DB, 'app_user', 'app_pw') };
}

export async function seedOrg(admin: Pool, name: string): Promise<string> {
  return (await admin.query('insert into organizations (name) values ($1) returning id', [name])).rows[0].id;
}
