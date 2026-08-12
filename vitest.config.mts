/**
 * Vitest configuration.
 *
 * Two kinds of test live here and they are deliberately separated:
 *
 *   tests/unit/         pure functions, no database, milliseconds
 *   tests/integration/  real Postgres, real Prisma, real ledgers
 *
 * The integration tests run against a SEPARATE database (zuridrive_test) so a
 * test run can never touch development data. The setup file refuses to start if
 * the URL does not name a test database — see tests/setup.ts.
 *
 * They also run one file at a time. These tests assert on aggregates across the
 * whole ledger ("deposits collected == held + returned + withheld"), and those
 * identities are only meaningful if nothing else is writing at the same time.
 *
 * .mts, not .ts: this file uses ESM syntax, and Vite's native config loader
 * treats a bare .ts config as CommonJS.
 */

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
    // Ledger-wide assertions cannot tolerate concurrent writers.
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    coverage: {
      provider: "v8",
      reportsDirectory: "./coverage",
      include: ["lib/**/*.ts"],
      exclude: ["lib/**/*.d.ts"],
      // The money code is the part where a gap actually costs someone.
      thresholds: {
        "lib/finance/**": { statements: 80, branches: 70, functions: 80, lines: 80 },
        "lib/subscriptions/**": { statements: 80, branches: 70, functions: 80, lines: 80 },
      },
    },
  },
  resolve: {
    alias: { "@": import.meta.dirname },
  },
});
