import { PrismaClient } from "@prisma/client";

// Singleton so Next.js dev hot-reload doesn't open a new pool on every change.
// At runtime DATABASE_URL is the POOLED (pgbouncer) url; migrations use DIRECT_URL.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
