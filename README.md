# nest-multitenant-rls

A multi-tenant NestJS API where **PostgreSQL row-level security enforces tenant isolation**, not
application code. Look at `src/api.controller.ts`: there is no `where org_id = ...` anywhere. Queries
are written as if there were one tenant, and the database makes that true.

```
request -> TenantGuard (verified token -> orgId)
        -> BEGIN; select set_config('app.org_id', orgId, true);   -- transaction-local
        -> query (RLS filters every row and checks every write)
        -> COMMIT                                                  -- tenant setting disappears
```

## Architecture

```mermaid
flowchart TD
    Client["Client<br/>Authorization: Bearer #lt;token#gt;"] --> Guard

    subgraph Nest["NestJS app"]
        Guard["TenantGuard<br/>verifyToken(): HMAC, expiry, uuid org<br/>→ req.orgId, else 401"] --> Ctrl
        Ctrl["ApiController<br/>/projects, /notes, /notes/:id, /me<br/>no WHERE org_id anywhere"] --> WT
        WT["Db.withTenant(orgId)<br/>BEGIN<br/>set_config('app.org_id', orgId, true)<br/>query · COMMIT / ROLLBACK"]
        Boot["Db.onModuleInit<br/>refuse to boot if role is<br/>superuser or BYPASSRLS"]
        Filter["ErrorsFilter<br/>23503 → 422, 42501 → 403,<br/>22P02 / 23514 → 400, else 500"]
        Ctrl -- "no row" --> NF["404 (other tenant's row<br/>looks missing)"]
    end

    WT -- "pooled connection as app_user<br/>(no owner, no bypass)" --> PG
    Boot -.-> PG
    WT -. "SQL errors" .-> Filter

    subgraph PG["PostgreSQL 16"]
        AppOrg["app_org()<br/>current_setting('app.org_id')<br/>NULL when unset → matches nothing"]
        Pol["RLS policies, FORCE on every table<br/>USING + WITH CHECK org_id = app_org()"]
        Tables[("organizations<br/>projects (unique id, org_id)<br/>notes → FK (project_id, org_id)")]
        Pol --> Tables
        AppOrg --> Pol
    end

    Migrate["npm run migrate<br/>migrate.ts as ADMIN role"] -- "001_init.sql:<br/>roles, tables, policies, grants" --> PG
```

## Why RLS instead of `WHERE org_id = ?`

A forgotten WHERE clause is the classic multi-tenant data leak. With RLS the same bug returns zero
rows instead of everyone's rows, and it covers hand-written SQL, ORMs, reports and future code.

| Defence | Where | Test |
|---|---|---|
| Tenant read from a signed, expiring token, never a client header | `token.ts`, `tenant.guard.ts` | tampered, expired, non-uuid tokens give 401 |
| Policies filter reads and `WITH CHECK` writes | `migrations/001_init.sql` | forged insert fails with SQLSTATE 42501 |
| Unset tenant matches nothing (fails closed) | `app_org()` returns NULL | query with no context returns `[]` |
| Transaction-local setting, no leak across pooled connections | `db.withTenant` | pool of 1, next query sees nothing |
| `FORCE ROW LEVEL SECURITY` on every tenant table | migration | catalog check |
| App connects as a plain role that owns nothing and cannot disable RLS | `app_user` | DDL attempts fail |
| App refuses to boot as a superuser or `BYPASSRLS` role | `Db.onModuleInit` | boot test |
| Child rows cannot point at another tenant's parent | composite FK `(project_id, org_id)` | cross-tenant note gives 422 |
| Another tenant's row looks like a missing row | controllers | 404, not 403 |
| Tests are not vacuous | disables RLS, shows the leak, re-enables | included |

## Run

```bash
docker compose up -d db
cp .env.example .env
npm ci
ADMIN_DATABASE_URL=postgres://postgres:postgres@localhost:5432/app npm run migrate
npm test                       # needs Postgres on localhost:5432 (TEST_ADMIN_URL to override)
DATABASE_URL=postgres://app_user:app_pw@localhost:5432/app TOKEN_SECRET=... npm run build && npm start
```

Make a token for an org id with `signToken(secret, orgId)` from `src/token.ts`.

## Design notes

- **Two database roles.** An admin or owner role runs migrations. `app_user` serves traffic. The
  owner of a table bypasses RLS unless forced, and superusers always bypass it, which is why the
  app checks its own role at boot.
- **Inserts use `app_org()`.** Clients never send an org id, so they cannot choose one.
- **Index `org_id`.** Every policy filters on it, so the composite indexes in the migration matter.
- **PgBouncer:** the `set_config(..., true)` pattern is safe in transaction pooling mode. Do not use
  session-level `set` there.
- **Tokens:** the HMAC token is a teaching stand-in. In production, read the org claim from your IdP's JWT.

## Verified here

13 tests pass against a real PostgreSQL 16 server. The Docker image was built and run against a local
Postgres 16: it migrated on boot, and `/me`, `POST /projects` and `GET /projects` worked with a minted
token. The compose file and CI workflow were not run, and Neon itself was not tested.

## Deploy (free)

**Vercel** (NestJS preset) with a **Neon** free Postgres project. The API connects as `app_user`
through Neon's pooled URL; migrations run at build time, for production deploys only, with the
owner's direct URL. The full guide, including which URL goes where and the trade-offs, is in
[docs/deployment.md](docs/deployment.md).

The Render blueprint (`render.yaml`, built from the `Dockerfile`) is kept as a fallback.

Mint a token for an org locally: `TOKEN_SECRET=... npm run token -- <org-uuid>`.

## Known limits

- No migrations for roles per tenant, no admin API to create organizations (seed through the admin role).
- No rate limiting or pagination cursors. Cross-tenant admin reporting needs a separate role and policy.
- Table-per-tenant or schema-per-tenant isolation is stronger but costs more to operate. RLS is the
  pragmatic middle.

## Changelog and contributing

Every change adds an entry under **Unreleased** in [`CHANGELOG.md`](CHANGELOG.md) and updates the
docs it affects (this README, `docs/`, `.env.example`, and `NOTES.md` for mistakes). A CI job fails
any pull request that skips the changelog (label it `skip-changelog` for changes that truly need
none). Before opening a PR:

```bash
npm run typecheck && npm test && npm run build   # tests need Postgres on localhost:5432
```

See `NOTES.md` for mistakes made and fixed.
