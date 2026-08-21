/**
 * scripts/check-countries.mjs
 *
 * The phone rules exist twice: as a table in lib/phone.ts, and as columns on
 * the Country rows in the database.
 *
 * Both are load-bearing. Normalisation runs during sign-up and inside client
 * components, neither of which can wait on a database round trip to decide
 * whether a number is valid — so the table has to be available synchronously.
 * The database copy is what admin screens and server-side logic read.
 *
 * Nothing makes them agree, which is the same shape of problem as the two
 * colour definitions. This refuses to let them drift: every active market must
 * appear in both, with the same prefix and the same digit count.
 */

import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";

const prisma = new PrismaClient();

// Read the table out of the source rather than importing it, so this runs
// without a TypeScript loader.
const source = readFileSync("lib/phone.ts", "utf8");
const table = {};
const block = source.match(/PHONE_FORMATS[^=]*=\s*\{([\s\S]*?)\n\};/);
if (!block) {
  console.error("Could not find PHONE_FORMATS in lib/phone.ts");
  process.exit(1);
}
for (const m of block[1].matchAll(
  /(\w+):\s*\{\s*code:\s*"(\w+)",\s*prefix:\s*"([^"]+)",\s*nationalDigits:\s*(\d+)/g,
)) {
  table[m[2]] = { prefix: m[3], nationalDigits: Number(m[4]) };
}

const countries = await prisma.country.findMany({ orderBy: { displayOrder: "asc" } });
const problems = [];

for (const c of countries) {
  const entry = table[c.code];
  if (!entry) {
    // Only an active market is a problem: a planned one can be seeded before
    // its number format has been checked.
    if (c.isActive) {
      problems.push(`${c.code} is a live market but has no entry in PHONE_FORMATS`);
    }
    continue;
  }
  if (entry.prefix !== c.phonePrefix) {
    problems.push(
      `${c.code}: PHONE_FORMATS says ${entry.prefix}, the database says ${c.phonePrefix}`,
    );
  }
  if (entry.nationalDigits !== c.phoneNationalDigits) {
    problems.push(
      `${c.code}: PHONE_FORMATS expects ${entry.nationalDigits} digits, ` +
        `the database says ${c.phoneNationalDigits}`,
    );
  }
}

for (const code of Object.keys(table)) {
  if (!countries.some((c) => c.code === code)) {
    problems.push(`PHONE_FORMATS has ${code}, which is not a country row`);
  }
}

// A market that trades needs somewhere to put the money.
for (const c of countries.filter((c) => c.isActive)) {
  if (!c.currency || c.currency.length !== 3) {
    problems.push(`${c.code} is live but its currency is "${c.currency}"`);
  }
}

await prisma.$disconnect();

if (problems.length) {
  console.error("Country configuration problems:\n");
  for (const p of problems) console.error(`  ${p}`);
  console.error(
    "\nlib/phone.ts and the Country table must agree: the first is what runs\n" +
      "during sign-up, the second is what the rest of the platform reads.",
  );
  process.exit(1);
}

const live = countries.filter((c) => c.isActive);
const planned = countries.filter((c) => !c.isActive);
for (const c of countries) {
  console.log(
    `  ${c.code}  ${c.name.padEnd(9)} ${c.currency}  ${c.phonePrefix}  ` +
      `${c.isActive ? "live" : "planned"}`,
  );
}
console.log(
  `\n${live.length} live market${live.length === 1 ? "" : "s"}, ` +
    `${planned.length} seeded and ready. Phone rules agree with the database.`,
);
