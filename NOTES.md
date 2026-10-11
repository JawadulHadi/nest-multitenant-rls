# Notes: mistakes and fixes

## 2026-10-11: Nest 12 broke the test runner

**What happened:** With the latest Nest, ts-jest failed under CommonJS before any test ran.
**Root cause:** Nest 12 is ESM-only, and this repo's Jest setup compiles to CommonJS.
**Fix:** Pinned Nest to 11 and TypeScript to 5.
**What I would do differently:** Check a framework's module format in its release notes before taking a new major version.

## 2026-10-11: CI "failed" in 3 seconds with no logs

**What happened:** The first CI runs went red in 2 to 3 seconds. `gh run view --log-failed` returned "log not found", which made it look like a broken workflow file.
**Root cause:** Not the code or the workflow. The run annotation said the job was not started because the GitHub account was locked over a billing issue, so no step ever ran.
**Fix:** Once the account lock was cleared, re-ran the checks. CI then passed on the same workflow with no changes to it.
**What I would do differently:** Read the run annotations (`gh run view <id>`) before touching the workflow. A red check that finishes in seconds with no logs is an account or runner problem, not a test failure.

