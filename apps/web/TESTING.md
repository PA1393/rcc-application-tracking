# Testing

## Tests are DISABLED

**Do not run `bun run test` or `bun x vitest` in this repo.**

A previous test run wiped the `Application` table on the real Supabase
database. Tests are disabled via a package.json kill switch that immediately
exits with an error message. Test files remain on disk because older tests
(`placement.test.ts`, `email.test.ts`, `applications-notes.test.ts`,
`upsert.test.ts`) mutate `Applicant`/`Application`/`Placement` and were the
proximate cause of the incident — deleting only the newer P1 tests would give
a false sense of safety.

## Safe verification: typecheck only

```
cd apps/web
bun run typecheck
```

Typecheck never imports Prisma at runtime and never touches the database. It
is the only automated verification currently allowed.

## Re-enabling tests (future work)

Tests may only be re-enabled after **all** of the following are true:

1. A disposable test database exists (local Docker Postgres, or a Supabase
   branch project whose database name explicitly contains `test`). It must
   never be the dev or production Supabase project.
2. `apps/web/.env.test` exists and points at that disposable database.
3. `apps/web/src/__tests__/setup.ts` (already in place) enforces:
   - `.env.test` file present — no fallback to `.env`
   - `DATABASE_URL` overridden from `.env.test` (not ambient env)
   - DB name contains `test` (case-insensitive)
   - `TEST_DB_CONFIRM=yes`
   Any failure prints a red `[TEST SAFETY] Refusing to run tests` message and
   `process.exit(1)` before Prisma is instantiated.
4. The kill switch in `apps/web/package.json` is replaced with the real
   vitest invocation — but only after (1)–(3) are verified.

### Setting up a disposable test database

```
docker run -d --name rcc-test -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16
createdb -h localhost -U postgres rcc_test
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/rcc_test" bun run db:push
cp apps/web/.env.test.example apps/web/.env.test
# edit apps/web/.env.test — confirm DB name contains "test" and set TEST_DB_CONFIRM=yes
```

Never commit `apps/web/.env.test`.

## What must never happen again

- Do not point `DATABASE_URL` at the real Supabase project when running tests.
- Do not weaken or bypass the guard in `src/__tests__/setup.ts`.
- Do not remove the kill switch in `apps/web/package.json` until the guard is
  verified working against a disposable test DB.
- Do not run `bun run db:push` against the dev/prod Supabase URL from a test
  workflow.
