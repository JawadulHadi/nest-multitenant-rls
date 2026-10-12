## What and why

<!-- What changes for an API client or whoever deploys it, and why. -->

## Checklist

- [ ] `npm run typecheck`, `npm test` (real Postgres) and `npm run build` pass
- [ ] New tables have RLS enabled and a policy, and a test proves another tenant can't see the rows
- [ ] `CHANGELOG.md` has an entry under **Unreleased**
- [ ] Docs updated where behaviour, config or limits changed (README, `docs/`, `.env.example`)
- [ ] `NOTES.md` entry if this fixes a mistake worth remembering
