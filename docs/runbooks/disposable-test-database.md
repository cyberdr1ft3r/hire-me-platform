# Disposable test database (local and Windows)

The PostgreSQL integration suites write to the database they run against: they create users, change role grants, and exercise constraints. Issue #90 (A-75-08) makes that safe by allowing them to run **only** against a database this checkout provisioned for itself. This runbook shows how to do that locally, including on Windows.

## Rules

- **Never** point any test command at a database you did not just provision: not production, not a shared server, not `hire_me_dev`, and not another agent's database. On a shared workstation, port 5432 may belong to another project.
- The test commands do not read `DATABASE_URL` or `.env`. They use `TEST_DATABASE_URL` only, and refuse anything that is not this checkout's provisioned database.
- Use a throwaway PostgreSQL server of your own on a Docker-assigned port with in-memory storage. Stop it when you are done.
- Connection strings are never printed. The provisioned URL is written to a creator-only file under the git-ignored `.tmp-runtime/test-db/`.

## What the guard checks

Every command (`provision`, `test:db`, `check-catalog`, `drop`, `verify-refusal`, and the foundational suite's schema create/drop) refuses before writing unless all of these hold:

1. `NODE_ENV` is exactly `test`. An unset `NODE_ENV` is treated as `test`; any other value refuses.
2. `TEST_DATABASE_URL` is set. There is no fallback to `DATABASE_URL`, `.env`, `.env.example`, `hire_me_dev`, or a default port.
3. The host is loopback, or exactly `TEST_DATABASE_ALLOW_HOST`. A permitted host is never proof on its own.
4. The database name has the generated `hireme_test_<utc timestamp>_<12 hex>` shape.
5. `.tmp-runtime/test-db/<name>.receipt.json` exists in this checkout, for the same database, host, and port. It holds an unpredictable run ID.
6. On the connection that will write, `current_database()` is that name.
7. On the same connection, the database comment is `hireme-disposable-test:v1:<run ID>`. Only `provision` sets it.

`drop` also re-checks the marker against the receipt on the single maintenance connection that issues `DROP DATABASE` (no `FORCE`). `provision` never reuses an existing database, and nothing ever drops a database it did not provision.

## Steps (Git Bash on Windows; the same commands work on macOS/Linux)

1. **Start a throwaway server** with a unique container name, a Docker-assigned host port, and in-memory storage. `MSYS_NO_PATHCONV=1` stops Git Bash rewriting the `--tmpfs` path.

   ```bash
   CN="hireme-test-$(openssl rand -hex 4)"
   MSYS_NO_PATHCONV=1 docker run --rm -d --name "$CN" \
     -e POSTGRES_USER=hireme_disposable -e POSTGRES_PASSWORD="$(openssl rand -hex 16)" \
     -e POSTGRES_DB=postgres -p 127.0.0.1::5432 --tmpfs /var/lib/postgresql/data \
     postgres:16.4-alpine
   PORT=$(docker port "$CN" 5432/tcp | head -1 | sed 's/.*://')
   PASSWORD=$(docker exec "$CN" printenv POSTGRES_PASSWORD)
   ```

   In PowerShell, use `docker port $CN 5432/tcp` to read the port, and set variables with `$env:NAME = "value"`.

2. **Provision** a marked database (migrations, seed twice, admin bootstrap twice, catalog snapshot):

   ```bash
   export NODE_ENV=test
   export TEST_DATABASE_ADMIN_URL="postgresql://hireme_disposable:${PASSWORD}@127.0.0.1:${PORT}/postgres"
   pnpm test:db:provision
   ```

   It prints the database name and the paths of its receipt and connection-string file.

3. **Select it** for the test commands:

   ```bash
   export TEST_DATABASE_URL="$(cat .tmp-runtime/test-db/<database name>.url)"
   ```

4. **Run the suite twice, with the catalog check after each pass, and no reseed in between.** The second pass uses the reverse file order to show no suite depends on another running first:

   ```bash
   pnpm test:db
   pnpm test:db:check-catalog
   HIREME_TEST_FILE_ORDER=reverse pnpm test:db
   pnpm test:db:check-catalog
   ```

5. **Optional checks:**

   ```bash
   pnpm test:db -- test/database.integration.test.ts   # the foundational suite alone
   pnpm test:db:verify-refusal                         # proves the guard refuses without writing
   ```

   `verify-refusal` creates an unmarked control database on the same throwaway server, proves every command refuses it (with no receipt, with a forged receipt, with `NODE_ENV=production`, and with only `DATABASE_URL` set) without changing it, and drops it again. To also prove refusal of a development-style database, set `TEST_DATABASE_REFUSAL_EXTRA_URL` to one **on your throwaway server** (for example create `hire_me_dev` there). It is observed read-only.

6. **Tear down** your own resources:

   ```bash
   pnpm test:db:drop
   docker stop "$CN"
   ```

## How the suites stay isolated

- The foundational schema tests (`database.integration.test.ts`) run in a generated `hm_found_*` schema. It is created on a connection that has just proved the database identity, every migration is applied into it, nothing is seeded, the test client is bound to it alone (its `search_path` excludes `public`), and it is dropped in `finally`. The suite never reads or writes the seeded catalog, so the old "run the destructive file last" ordering is gone.
- The authentication suite removes only its own `@auth.test` users' sessions, credentials, and audit entries.
- The administration suite restores the SUPER_ADMIN assignments it suspends during its concurrency test.

## What `check-catalog` guarantees, and what it does not

It fails if any seeded role or permission row was deleted or replaced (compared by identifier and name/code), if any seeded grant pair (role, permission) is missing, if any SUPER_ADMIN grant is no longer active, or if the bootstrap administrator's account, SUPER_ADMIN role, or credential is gone or it can no longer log in and resolve every seeded permission.

It does **not** claim every seeded grant is unchanged. It reports, by name:

- non-critical seeded grants whose active state differs from the snapshot;
- seeded grant rows that suites delete and re-insert with the same pair when they narrow a role and restore it (they get new row identifiers).

Both are a known coupling between some suites and the shared seeded roles, tracked separately from Issue #90.
