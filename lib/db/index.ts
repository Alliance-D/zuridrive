// =============================================================================
// ZuriDrive — Database access barrel
//
// The Prisma client singleton lives in lib/prisma.ts. This module re-exports it
// under both the names used across the codebase:
//   • `db`     — used by the booking / trip / cron routes
//   • `prisma` — used by the auth, dashboard and profile routes
// Both are the SAME instance. Prefer `prisma` in new code.
//
// It also has a default export so the legacy `import prisma from "@/lib/db"`
// form keeps working.
// =============================================================================

import { prisma } from "@/lib/prisma";

export { prisma };
export const db = prisma;
export default prisma;

// Re-export the shared query helpers so `@/lib/db` is the single entry point.
export * from "@/lib/db/queries";
