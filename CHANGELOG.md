# Changelog

All notable changes to nest-multitenant-rls. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The project has no version tags yet, so
past entries are grouped by merged pull request and date.

Every change adds an entry under **Unreleased** in the same pull request. CI checks this.

## [Unreleased]

### Added
- Vercel deployment: `vercel.json` (NestJS preset) and `vercel-build.sh`, which builds the app and,
  for production deploys only, runs migrations and sets `app_user`'s password.
- `DB_POOL_MAX` environment variable to cap connections per instance (default 10; use 2 on Vercel).
  An invalid value stops startup with a clear error.
- `docs/deployment.md`: Vercel with Neon (direct owner URL for migrations, pooled `app_user` URL at
  runtime), the Render fallback, and the trade-offs.
- `CHANGELOG.md` (this file), a pull request template, and a CI job that fails a pull request
  which doesn't update the changelog. Label a PR `skip-changelog` to bypass it.

### Changed
- README "Deploy (free)" now points at Vercel. Render and the Dockerfile stay as a fallback.

## PR #2 (2026-10-12)

### Added
- First real `NOTES.md` entries.

## PR #1 (2026-10-12)

### Added
- Architecture diagram in the README, Render free-tier blueprint with Neon Postgres, `Dockerfile`
  that migrates on boot when `ADMIN_DATABASE_URL` is set, `APP_USER_PASSWORD` rotation, MIT
  license and `.env.example`.
- CI against a real PostgreSQL 16 service: typecheck, tests and build.

## Initial commit (2026-10-12)

### Added
- Multi-tenant NestJS API where PostgreSQL row-level security enforces tenant isolation: a
  restricted `app_user` role, transaction-local tenant context, signed tenant tokens, a startup
  check that refuses roles able to bypass RLS, and tests that prove the leak when RLS is off.
