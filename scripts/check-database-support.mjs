/**
 * scripts/check-database-support.mjs
 *
 * Asks a candidate database whether it can actually run ZuriDrive, before you
 * move anything onto it.
 *
 * The check that matters is btree_gist. The bookings table carries an
 * exclusion constraint that physically prevents two overlapping bookings on
 * the same car — it is what stops one vehicle being sold twice. A provider
 * that will not allow the extension fails that migration, and if somebody then
 * skips past it, double bookings come back silently: nothing errors, two
 * people simply arrive for the same car.
 *
 * Being listed as available is not enough, and being creatable is not enough
 * either, so this builds the real constraint on a scratch table and tries to
 * insert an overlap. If the database refuses it, the protection works here.
 *
 *   DATABASE_URL="postgres://..." node scripts/check-database-support.mjs
 *
 * Everything it creates is a TEMP table, dropped when the connection closes.
 * It writes nothing you have to clean up, so it is safe against a live
 * database — though there is no reason to point it at one.
 */

import { PrismaClient } from "@prisma/client";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Set DATABASE_URL to the database you want to test:\n");
  console.error('  DATABASE_URL="postgres://..." node scripts/check-database-support.mjs\n');
  process.exit(1);
}

const prisma = new PrismaClient({ datasources: { db: { url } } });

// Show where it connected, with the password removed, so you cannot test one
// database and then deploy against another.
console.log(`\nChecking ${url.replace(/\/\/[^@]*@/, "//***@").replace(/\?.*$/, "")}\n`);

let failed = false;
const ok = (label, detail) => console.log(`  ok    ${label}${detail ? `  — ${detail}` : ""}`);
const note = (label, detail) => console.log(`  note  ${label}${detail ? `  — ${detail}` : ""}`);
const bad = (label, detail) => {
  failed = true;
  console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`);
};
const firstLine = (e) => String(e?.message ?? e).split("\n")[0].slice(0, 90);

try {
  // ── Version ──────────────────────────────────────────────────────────────
  const [{ version }] = await prisma.$queryRawUnsafe("SELECT version()");
  const number = version.match(/PostgreSQL ([\d.]+)/)?.[1] ?? "unknown";
  if (Number(number.split(".")[0]) >= 14) ok("PostgreSQL", number);
  else bad("PostgreSQL", `${number} — this project expects 14 or newer`);

  // ── The extension, three ways ────────────────────────────────────────────
  const listed = await prisma.$queryRawUnsafe(
    "SELECT name FROM pg_available_extensions WHERE name = 'btree_gist'",
  );
  if (listed.length) ok("btree_gist is offered");
  else bad("btree_gist is not offered", "double-booking protection cannot be installed");

  // Offered is not permitted — some managed providers restrict what you may
  // actually create.
  try {
    await prisma.$executeRawUnsafe("CREATE EXTENSION IF NOT EXISTS btree_gist");
    ok("btree_gist can be created");
  } catch (e) {
    bad("btree_gist cannot be created", firstLine(e));
  }

  // Permitted is not working. Build the real thing and try to break it.
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TEMP TABLE overlap_probe (
        id      serial PRIMARY KEY,
        car_id  text NOT NULL,
        starts  timestamp NOT NULL,
        ends    timestamp NOT NULL,
        EXCLUDE USING gist (
          car_id WITH =,
          tsrange(starts, ends, '[]') WITH &&
        )
      )`);

    await prisma.$executeRawUnsafe(
      "INSERT INTO overlap_probe (car_id, starts, ends) VALUES ('car', '2030-01-10', '2030-01-13')",
    );

    let refused = false;
    try {
      // The 12th falls inside the 10th–13th. This must not be accepted.
      await prisma.$executeRawUnsafe(
        "INSERT INTO overlap_probe (car_id, starts, ends) VALUES ('car', '2030-01-12', '2030-01-15')",
      );
    } catch {
      refused = true;
    }

    if (refused) ok("overlapping bookings are refused", "double-booking protection works");
    else bad("an overlapping booking was ACCEPTED", "the constraint is not enforcing");

    // And the constraint must not be so eager that it blocks legitimate
    // back-to-back bookings on different cars.
    await prisma.$executeRawUnsafe(
      "INSERT INTO overlap_probe (car_id, starts, ends) VALUES ('other-car', '2030-01-12', '2030-01-15')",
    );
    ok("a different car on the same dates is allowed");
  } catch (e) {
    bad("could not build the exclusion constraint", firstLine(e));
  }

  // ── Connections ──────────────────────────────────────────────────────────
  // Serverless functions open one each, so the ceiling matters more here than
  // it would behind a long-running server.
  const [{ max_connections }] = await prisma.$queryRawUnsafe("SHOW max_connections");
  const limit = Number(max_connections);
  if (limit >= 100) ok("connection limit", String(limit));
  else
    note(
      `connection limit is ${limit}`,
      "use the POOLED connection string for DATABASE_URL, not the direct one",
    );
} catch (error) {
  bad("could not connect", firstLine(error));
} finally {
  await prisma.$disconnect();
}

console.log(
  failed
    ? "\nThis database cannot run ZuriDrive as it stands.\n"
    : "\nThis database can run ZuriDrive.\n",
);
process.exit(failed ? 1 : 0);
