import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { Db } from '../src/db';
import { signToken } from '../src/token';
import { SECRET, freshDatabase, seedOrg } from './helpers';

describe('tenant isolation enforced by PostgreSQL', () => {
  let admin: Pool, appUrl: string, adminUrl: string;
  let app: INestApplication, db: Db;
  let orgA: string, orgB: string, tokenA: string, tokenB: string;

  beforeAll(async () => {
    ({ admin, appUrl, adminUrl } = await freshDatabase());
    orgA = await seedOrg(admin, 'Acme');
    orgB = await seedOrg(admin, 'Globex');
    tokenA = signToken(SECRET, orgA);
    tokenB = signToken(SECRET, orgB);
    const mod = await Test.createTestingModule({ imports: [AppModule.register({ databaseUrl: appUrl, tokenSecret: SECRET, poolMax: 1 })] }).compile();
    app = mod.createNestApplication();
    await app.init();
    db = mod.get(Db);
  });

  afterAll(async () => {
    await app.close();
    await admin.end();
  });

  const as = (token: string) => ({
    get: (url: string) => request(app.getHttpServer()).get(url).set('authorization', `Bearer ${token}`),
    post: (url: string, body: object) => request(app.getHttpServer()).post(url).set('authorization', `Bearer ${token}`).send(body),
    del: (url: string) => request(app.getHttpServer()).delete(url).set('authorization', `Bearer ${token}`),
  });

  let projectA: string, noteA: string;

  it('each tenant creates and reads its own data', async () => {
    projectA = (await as(tokenA).post('/projects', { name: 'Apollo' }).expect(201)).body.id;
    noteA = (await as(tokenA).post('/notes', { projectId: projectA, title: 'secret plan', body: 'launch in May' }).expect(201)).body.id;
    expect((await as(tokenA).get(`/notes/${noteA}`).expect(200)).body.title).toBe('secret plan');
    expect((await as(tokenA).get('/me').expect(200)).body.name).toBe('Acme');
  });

  it('another tenant cannot list, read or delete it, and gets 404 not 403', async () => {
    expect((await as(tokenB).get('/notes').expect(200)).body).toEqual([]);
    expect((await as(tokenB).get('/projects').expect(200)).body).toEqual([]);
    await as(tokenB).get(`/notes/${noteA}`).expect(404);
    await as(tokenB).del(`/notes/${noteA}`).expect(404);
    expect((await admin.query('select count(*)::int as n from notes where id = $1', [noteA])).rows[0].n).toBe(1);
    expect((await as(tokenB).get('/me').expect(200)).body.name).toBe('Globex');
  });

  it('cannot attach a note to another tenant\'s project (composite foreign key)', async () => {
    const res = await as(tokenB).post('/notes', { projectId: projectA, title: 'sneaky', body: '' });
    expect(res.status).toBe(422);
    expect((await admin.query("select count(*)::int as n from notes where title = 'sneaky'")).rows[0].n).toBe(0);
  });

  it('the database rejects writes for another org even with hand-written SQL (WITH CHECK)', async () => {
    await expect(
      db.withTenant(orgB, (c) => c.query("insert into projects (org_id, name) values ($1, 'forged')", [orgA])),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('a query with no tenant context sees nothing (fails closed)', async () => {
    expect((await admin.query('select count(*)::int as n from notes')).rows[0].n).toBeGreaterThan(0);
    expect((await db.pool.query('select * from notes')).rows).toEqual([]);
    expect((await db.pool.query('select * from projects')).rows).toEqual([]);
  });

  it('the tenant does not leak to the next user of a pooled connection', async () => {
    // pool max is 1, so both calls share one physical connection
    await as(tokenA).get('/notes').expect(200);
    expect((await db.pool.query("select current_setting('app.org_id', true) as v")).rows[0].v).toBeFalsy();
    expect((await db.pool.query('select * from notes')).rows).toEqual([]);
  });

  it('rolls back the whole request if something fails, including the tenant setting', async () => {
    await expect(db.withTenant(orgA, async (c) => { await c.query("insert into projects (org_id, name) values (app_org(), 'temp')"); throw new Error('boom'); })).rejects.toThrow('boom');
    expect((await admin.query("select count(*)::int as n from projects where name = 'temp'")).rows[0].n).toBe(0);
  });

  it('rejects missing, tampered, expired and non-uuid tokens', async () => {
    const http = request(app.getHttpServer());
    await http.get('/notes').expect(401);
    await http.get('/notes').set('authorization', 'Bearer garbage').expect(401);
    await http.get('/notes').set('authorization', `Bearer ${tokenA.slice(0, -2)}xx`).expect(401);
    await http.get('/notes').set('authorization', `Bearer ${signToken(SECRET, orgA, -10)}`).expect(401);
    await http.get('/notes').set('authorization', `Bearer ${signToken(SECRET, "x'; drop table notes;--")}`).expect(401);
    await http.get('/notes').set('authorization', `Bearer ${signToken('another-secret-16+chars', orgA)}`).expect(401);
  });

  it('validates input and does not leak SQL errors', async () => {
    await as(tokenA).post('/notes', { projectId: 'nope', title: 'x' }).expect(400);
    await as(tokenA).get('/notes/not-a-uuid').expect(400);
    await as(tokenA).post('/projects', { name: '' }).expect(400);
    const bad = await as(tokenA).post('/notes', { projectId: projectA, title: 'x'.repeat(201) });
    expect(bad.status).toBe(400);
  });

  it('app_user is a plain role and owns nothing, so RLS cannot be bypassed', async () => {
    const r = (await admin.query("select rolsuper, rolbypassrls from pg_roles where rolname = 'app_user'")).rows[0];
    expect(r).toEqual({ rolsuper: false, rolbypassrls: false });
    const owned = (await admin.query("select count(*)::int as n from pg_tables where schemaname = 'public' and tableowner = 'app_user'")).rows[0].n;
    expect(owned).toBe(0);
    await expect(db.pool.query('drop table notes')).rejects.toBeDefined();
    await expect(db.pool.query('alter table notes disable row level security')).rejects.toBeDefined();
  });

  it('every tenant table has RLS enabled and forced', async () => {
    const rows = (await admin.query(
      "select relname, relrowsecurity, relforcerowsecurity from pg_class where relname in ('organizations','projects','notes') order by relname")).rows;
    expect(rows).toHaveLength(3);
    for (const r of rows) expect(r).toMatchObject({ relrowsecurity: true, relforcerowsecurity: true });
  });

  it('proves the tests are not vacuous: with RLS switched off the same query leaks across tenants', async () => {
    await admin.query('alter table notes disable row level security');
    try {
      const leaked = await db.pool.query('select id from notes');
      expect(leaked.rows.length).toBeGreaterThan(0); // no tenant set, yet rows are visible
    } finally {
      await admin.query('alter table notes enable row level security');
    }
    expect((await db.pool.query('select id from notes')).rows).toEqual([]);
  });

  it('refuses to boot when connected as a role that bypasses RLS', async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule.register({ databaseUrl: adminUrl, tokenSecret: SECRET })] }).compile();
    const bad = mod.createNestApplication();
    await expect(bad.init()).rejects.toThrow(/bypasses row-level security/);
    await bad.close().catch(() => undefined);
  });
});
