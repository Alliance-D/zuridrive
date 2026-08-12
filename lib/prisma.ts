// =============================================================================
// ZuriDrive — Prisma Client Singleton
// Prevents multiple PrismaClient instances during Next.js hot reloading in dev
// In production a single instance is created and reused
// =============================================================================

import { PrismaClient } from "@prisma/client";

// Extend global type to store the prisma instance across hot reloads
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

// In development, persist the client on globalThis to survive hot reloads
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

// Default export so both `import { prisma }` and `import prisma` resolve to the
// same singleton — several modules use each form.
export default prisma;
