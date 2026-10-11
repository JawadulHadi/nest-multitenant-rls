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

13 tests pass against a real PostgreSQL 16 server. The Docker compose file and CI workflow were not
run in this environment, and the README commands were exercised through the test suite rather than by hand.

## Known limits

- No migrations for roles per tenant, no admin API to create organizations (seed through the admin role).
- No rate limiting or pagination cursors. Cross-tenant admin reporting needs a separate role and policy.
- Table-per-tenant or schema-per-tenant isolation is stronger but costs more to operate. RLS is the
  pragmatic middle.

See `NOTES.md` for mistakes made and fixed.
