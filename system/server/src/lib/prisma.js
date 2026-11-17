import { PrismaClient } from "./prisma-client-bundle.js";
import { withPrismaPoolLimit } from "./dbUrl.js";

const globalForPrisma = globalThis;

/**
 * Use env DATABASE_URL, and only append missing pooler-safe query params
 * via string concat (never new URL() — that can corrupt passwords).
 */
const datasourceUrl = withPrismaPoolLimit(process.env.DATABASE_URL, 1);

if (!globalForPrisma.prisma) {
  globalForPrisma.prisma = new PrismaClient({
    /**
     * Secrets are never returned unless a query asks for them explicitly
     * (select / omit: { field: false }) — NFR-11.
     */
    omit: {
      user: { passwordHash: true, resetTokenHash: true },
      customer: { passwordHash: true, verifyTokenHash: true, resetTokenHash: true },
    },
    /**
     * Interactive transactions: Prisma's 5 s default is too short on Vercel, where every query is a
     * network round trip to Supabase (a product with variants and opening stock needs dozens).
     * Stays well inside the 60 s function limit; transactions that pass their own options keep them.
     */
    transactionOptions: { maxWait: 10000, timeout: 30000 },
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    ...(datasourceUrl
      ? { datasources: { db: { url: datasourceUrl } } }
      : {}),
  });
}

export const prisma = globalForPrisma.prisma;
