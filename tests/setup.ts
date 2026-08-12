/**
 * Test setup — loaded before every test file.
 *
 * The single most important thing here is the guard below. These tests delete
 * rows and assert on whole-ledger totals; pointed at a development or (worse)
 * production database they would destroy real data. So we refuse to start
 * unless the connection string names a database ending in `_test`.
 *
 * Run them with:
 *   npm test
 * which sets TEST_DATABASE_URL for you (see package.json).
 */

import { config } from "dotenv";

// .env.local first so local overrides win, then .env.
config({ path: ".env.local" });
config({ path: ".env" });

const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "";

if (!url) {
  throw new Error(
    "No database URL. Set TEST_DATABASE_URL (or DATABASE_URL) before running tests.",
  );
}

// The guard. Do not weaken this to make a test run somewhere convenient.
const database = url.split("/").pop()?.split("?")[0] ?? "";

if (!database.endsWith("_test")) {
  throw new Error(
    `Refusing to run tests against "${database}".\n` +
      `These tests delete rows and assert on ledger-wide totals, so they must\n` +
      `only ever point at a database whose name ends in "_test".\n` +
      `Create one with:\n` +
      `  docker exec zuridrive-db psql -U zuridrive -c "CREATE DATABASE zuridrive_test"\n` +
      `then set TEST_DATABASE_URL to it.`,
  );
}

// Everything downstream (Prisma, lib code) reads DATABASE_URL.
process.env.DATABASE_URL = url;

// Keep third-party side effects out of the test run. Any test that needs to
// assert on SMS or MoMo behaviour mocks the module explicitly instead.
process.env.AT_USERNAME ??= "sandbox";
process.env.AT_API_KEY ??= "test-key";
process.env.AT_SENDER_ID ??= "ZuriDrive";
process.env.MTN_MOMO_BASE_URL ??= "https://sandbox.momodeveloper.mtn.com";
process.env.MTN_MOMO_API_USER ??= "test-user";
process.env.MTN_MOMO_API_KEY ??= "test-key";
process.env.MTN_MOMO_COLLECTION_PRIMARY_KEY ??= "test-key";
process.env.MTN_MOMO_ENVIRONMENT ??= "sandbox";
process.env.NEXTAUTH_SECRET ??= "test-secret-not-used-for-real-sessions";
process.env.CRON_SECRET ??= "test-cron-secret";
