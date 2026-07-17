# Quarantined tests — DO NOT RE-ENABLE WITHOUT A DISPOSABLE TEST DATABASE

## Why this directory exists

A previous test run wiped the `Application` table on the real Supabase
database. The tests in this directory mutate `Applicant`, `Application`,
`Placement`, and related tables through the real Prisma client. The test
harness had no guard preventing it from connecting to the dev/production
Supabase project.

This directory is quarantined so that neither `bun test` (Bun's built-in
runner, which auto-discovers files matching `*.test.*` and `*.spec.*`) nor
`bun x vitest` can discover or execute these files:

1. The directory has been renamed from `__tests__` to
   `__tests_DISABLED_DO_NOT_RUN__` so that vitest's default include pattern
   (`src/__tests__/**/*.test.ts`) matches nothing.
2. Every test file has been renamed with a `.disabled` suffix
   (`*.test.ts.disabled`, `*.spec.ts.disabled`, etc.) so Bun's built-in test
   discovery cannot match them either.
3. `apps/web/package.json` also has a kill switch on `bun run test` /
   `bun run test:watch` that prints an error and exits 1.

## What to use instead right now

For safe automated verification, use typecheck only:

```
cd apps/web
bun run typecheck
```

Typecheck never imports Prisma at runtime and never touches the database.

## How to re-enable tests (future work)

All of these must be true before removing the `.disabled` suffixes or
renaming the directory back:

1. A disposable test database exists — local Docker Postgres, or a Supabase
   branch project whose database name explicitly contains `test`. It must
   never be the dev or production Supabase project.
2. `apps/web/.env.test` exists and points at that disposable database. See
   `apps/web/.env.test.example` for the template.
3. `setup.ts` in this directory (kept in place) enforces:
   - `.env.test` file present — no fallback to `.env`
   - `DATABASE_URL` overridden from `.env.test` (not ambient env)
   - DB name contains `test` (case-insensitive)
   - `TEST_DB_CONFIRM=yes`
   On any failure it prints a red `[TEST SAFETY] Refusing to run tests`
   message and `process.exit(1)` before Prisma is instantiated.
4. The kill switch in `apps/web/package.json` is replaced with the real
   vitest invocation only after (1)–(3) are verified.
5. `apps/web/vitest.config.ts` `setupFiles` and `include` paths are updated
   to point at the un-quarantined directory.

See `apps/web/TESTING.md` for the top-level story.

## Contents of this directory

- `*.test.ts.disabled` — quarantined test files (11 total).
- `__mocks__/` — test-only module mocks kept for future re-enablement.
- `setup.ts` — the safety guard, kept in place so it's ready if tests are
  re-enabled. Currently unused because vitest is not discovering it.
- `README.md` — this file.
