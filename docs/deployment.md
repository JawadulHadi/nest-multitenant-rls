# Deployment

The API deploys to **Vercel** (NestJS preset) with a **Neon** free Postgres project. The Render
blueprint and the `Dockerfile` stay in the repo as a fallback (see [Render](#render-fallback)).

| Piece | Where | Config |
| --- | --- | --- |
| API | Vercel Function running the NestJS app (`src/main.ts`) | `vercel.json`, `vercel-build.sh` |
| Database | Neon free Postgres | `ADMIN_DATABASE_URL`, `DATABASE_URL`, `APP_USER_PASSWORD` |

## Two roles, two URLs

Row-level security only protects you if the API connects as a role that does not own the tables
and cannot bypass RLS. The app checks this on startup and refuses to run otherwise.

| Variable | Role | Neon URL | Used by |
| --- | --- | --- | --- |
| `ADMIN_DATABASE_URL` | Neon owner (`neondb_owner`) | **direct** (no `-pooler`) | Migrations, at build time only |
| `DATABASE_URL` | `app_user` | **pooled** (`-pooler` host) | The API at runtime |

The pooled URL is safe here because the tenant is set with `set_config('app.org_id', ..., true)`
inside a transaction, so it never outlives the transaction, which is what Neon's transaction-mode
pooler requires.

## Vercel

1. Create a Neon project (AWS `us-east-1`, close to Vercel's default region). Copy the owner's
   **direct** connection string: that is `ADMIN_DATABASE_URL`.
2. Pick a long `APP_USER_PASSWORD` (16+ characters). `DATABASE_URL` is the **pooled** connection
   string with user `app_user` and that password.
3. In Vercel: **Add New → Project**, import `JawadulHadi/nest-multitenant-rls`. `vercel.json` sets
   the NestJS preset and the build command. Add these environment variables:

   | Variable | Value |
   | --- | --- |
   | `ADMIN_DATABASE_URL` | From step 1 |
   | `APP_USER_PASSWORD` | From step 2 |
   | `DATABASE_URL` | From step 2 |
   | `TOKEN_SECRET` | A random string, 16+ characters |
   | `DB_POOL_MAX` | `2` (each serverless instance keeps its own small pool) |

4. Deploy. `vercel-build.sh` compiles the app, then, **for production deploys only**, runs the
   migrations and sets `app_user`'s password from `APP_USER_PASSWORD`. Preview deploys skip
   migrations so they can't change the production database.
5. Smoke test with a token for an org (mint it locally with the same `TOKEN_SECRET`):

   ```bash
   TOKEN_SECRET=... npm run token -- <org-uuid>
   curl -H "authorization: Bearer <token>" https://<project>.vercel.app/me
   ```

### Trade-offs on Vercel

- `ADMIN_DATABASE_URL` is visible to the runtime as well as the build, because Vercel doesn't scope
  variables to build only. The app never reads it, but if you want the runtime to hold no owner
  credentials, remove it after the first production deploy and run `npm run migrate` by hand when
  you add a migration.
- Functions start cold after idle time, so the first request is slower (about a second, not the
  ~30 s Render free wake-up).

## Render (fallback)

`render.yaml` is a blueprint for a Render free web service built from the `Dockerfile`. Use Neon's
**direct** URLs for both variables there. In Render: **New → Blueprint**, pick this repo, fill
`ADMIN_DATABASE_URL`, `DATABASE_URL` and `APP_USER_PASSWORD`; `TOKEN_SECRET` is generated. The
container migrates on boot when `ADMIN_DATABASE_URL` is set.

## Local

See [Run](../README.md#run) in the README: `docker compose up -d db`, then `npm run migrate` with
the owner URL, then `npm start` as `app_user`.
