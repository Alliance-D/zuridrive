/**
 * Test database helpers.
 *
 * Every integration test starts from an empty database. That is slower than
 * sharing fixtures, but it is the only way the ledger assertions mean anything:
 * "deposits collected == held + returned + withheld" is a statement about the
 * WHOLE table, so leftovers from another test would make a passing run
 * meaningless and a failing one impossible to diagnose.
 */

import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

/**
 * Empties every table.
 *
 * DELETE, not TRUNCATE. TRUNCATE is the obvious choice and it is 350x slower
 * here — measured at ~7s per call against ~20ms — because it rewrites every
 * table file, and file operations against a Docker volume on Windows are
 * expensive. Multiplied by every test, that was the entire runtime of the
 * suite. DELETE only touches rows, of which there are almost none.
 *
 * Foreign keys are suppressed for the duration via session_replication_role,
 * because DELETE — unlike TRUNCATE CASCADE — enforces them, and the catalogue
 * does not hand back tables in dependency order. It is restored immediately
 * afterwards, and only ever affects this session against the test database.
 *
 * The table list is read from the catalogue rather than hard-coded, so a new
 * model cannot silently start leaking state between tests. Sequences are not
 * reset because every id is a cuid.
 */
const DELETE_ALL = `
  DO $$
  DECLARE r RECORD;
  BEGIN
    SET CONSTRAINTS ALL DEFERRED;
    SET session_replication_role = replica;

    FOR r IN (
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename NOT LIKE '_prisma%'
    )
    LOOP
      EXECUTE 'DELETE FROM "public"."' || r.tablename || '"';
    END LOOP;

    SET session_replication_role = origin;
  END $$;
`;

export async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe(DELETE_ALL);
}

export async function disconnect(): Promise<void> {
  await prisma.$disconnect();
}
