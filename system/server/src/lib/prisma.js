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
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    ...(datasourceUrl
      ? { datasources: { db: { url: datasourceUrl } } }
      : {}),
  });
}

export const prisma = globalForPrisma.prisma;
