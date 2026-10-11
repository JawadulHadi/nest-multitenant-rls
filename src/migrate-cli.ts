import { runMigrations } from './migrate';

const url = process.env.ADMIN_DATABASE_URL;
if (!url) throw new Error('set ADMIN_DATABASE_URL (a superuser or table owner, not app_user)');
runMigrations(url).then(() => console.log('migrations applied'));
