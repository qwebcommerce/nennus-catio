/**
 * Applies pending Prisma migrations during a Vercel build.
 * Skips (without failing the build) when no database URL is available at build time.
 * DIRECT_URL should be the Supabase direct connection (port 5432); it falls back to DATABASE_URL.
 */
import { execSync } from "child_process";

if (!process.env.DATABASE_URL) {
  console.warn("[migrate] DATABASE_URL is not set at build time; skipping prisma migrate deploy.");
  process.exit(0);
}
if (!process.env.DIRECT_URL) {
  console.warn("[migrate] DIRECT_URL is not set; using DATABASE_URL for migrations.");
  process.env.DIRECT_URL = process.env.DATABASE_URL;
}
execSync("npx prisma migrate deploy", { stdio: "inherit", env: process.env });
