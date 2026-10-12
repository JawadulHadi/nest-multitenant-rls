#!/usr/bin/env sh
# Vercel build step (vercel.json buildCommand). Vercel has no pre-deploy hook, so migrations run
# here, against the direct (non-pooled) owner URL, and only for production deploys: previews
# would otherwise migrate the production database. Migrations are idempotent (schema_migrations).
set -eu

npm run build

if [ "${VERCEL_ENV:-}" = "production" ] && [ -n "${ADMIN_DATABASE_URL:-}" ]; then
  node dist/migrate-cli.js
else
  echo "Skipping migrations (VERCEL_ENV=${VERCEL_ENV:-unset}; ADMIN_DATABASE_URL set: $([ -n "${ADMIN_DATABASE_URL:-}" ] && echo yes || echo no))"
fi
