-- Local development database setup for native PostgreSQL.
--
-- Replaces the Docker container that used to provide Postgres on port 5433.
-- Creates the role and the two databases the project expects:
--
--   zuridrive       — the app's development database (DATABASE_URL)
--   zuridrive_test  — the test database (TEST_DATABASE_URL)
--
-- The test database is separate and non-negotiable: tests/setup.ts refuses to
-- run unless the database name ends in "_test", because the suite deletes rows
-- and asserts on ledger-wide totals. Pointing it at the dev database would
-- wipe your seed data.
--
-- Run with:
--   & "E:\PostgreSQL\18\bin\psql.exe" -U postgres -h localhost -p 5432 -f scripts\setup-local-db.sql
--
-- These credentials are development-only and match what the Docker container
-- used. Never use them for anything reachable from outside this machine.

-- Role. CREATE ROLE has no IF NOT EXISTS, so this is guarded.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'zuridrive') THEN
    CREATE ROLE zuridrive WITH LOGIN PASSWORD 'zuridrive' CREATEDB;
  ELSE
    ALTER ROLE zuridrive WITH LOGIN PASSWORD 'zuridrive' CREATEDB;
  END IF;
END
$$;

-- Databases. CREATE DATABASE cannot run inside a transaction block or a DO
-- block, so these are plain statements — re-running them reports an error for
-- any database that already exists, which is harmless.
CREATE DATABASE zuridrive OWNER zuridrive;
CREATE DATABASE zuridrive_test OWNER zuridrive;

-- tests/helpers/db.ts truncates every table between tests and sets
-- session_replication_role = replica first, so foreign keys don't block the
-- delete order. That parameter is superuser-only by default, and the Docker
-- image's role happened to be a superuser, which is why this was never needed
-- before.
--
-- Granting the one parameter is much narrower than making the role a
-- superuser, which is what the container effectively did. Postgres 15+ only.
--
-- Run this against the TEST database (connect with -d zuridrive_test):
--   GRANT SET ON PARAMETER session_replication_role TO zuridrive;
