import { Client } from 'pg';
import { runMigrations } from './migrate';

const url = process.env.ADMIN_DATABASE_URL;
if (!url) throw new Error('set ADMIN_DATABASE_URL (a superuser or table owner, not app_user)');

/** 001_init.sql creates app_user with a dev password. On a real host, set APP_USER_PASSWORD to replace it. */
async function rotateAppUserPassword(adminUrl: string, password: string) {
  if (password.length < 16) throw new Error('APP_USER_PASSWORD must be 16+ characters');
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    const { rows } = await client.query("select format('alter role app_user password %L', $1::text) as sql", [password]);
    await client.query(rows[0].sql);
  } finally {
    await client.end();
  }
}

async function main() {
  await runMigrations(url!);
  console.log('migrations applied');
  if (process.env.APP_USER_PASSWORD) {
    await rotateAppUserPassword(url!, process.env.APP_USER_PASSWORD);
    console.log('app_user password set from APP_USER_PASSWORD');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
