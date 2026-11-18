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

// Agreement 8.1: copy files still kept in the database into Supabase Storage. Only when storage is
// configured; a failure is logged and does not fail the build (the files stay served from the database).
if (process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
  try {
    execSync("node scripts/move-files-to-storage.mjs", { stdio: "inherit", env: process.env, timeout: 10 * 60 * 1000 });
  } catch (e) {
    console.warn(`[migrate] moving files to Supabase Storage failed (${e?.message || e}); files stay in the database for now.`);
  }
} else {
  console.log("[migrate] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set; files stay in the database.");
}

// Demo data (docs/testing/README.md, "Demo data"): DEMO_DATA=load fills the database with a demo
// shop and 30 days of activity, DEMO_DATA=remove takes every demo row out again. Runs after the
// migrations; a failure is logged and never fails the build (each step leaves the database whole).
const demoMode = String(process.env.DEMO_DATA || "").trim().toLowerCase();
if (demoMode === "load" || demoMode === "remove") {
  const started = Date.now();
  try {
    execSync(`node scripts/demo-data.mjs ${demoMode}`, { stdio: "inherit", env: process.env, timeout: 25 * 60 * 1000 });
    console.log(`[migrate] demo data ${demoMode} finished in ${Math.round((Date.now() - started) / 1000)} s.`);
  } catch (e) {
    console.warn(`[migrate] DEMO DATA ${demoMode.toUpperCase()} FAILED after ${Math.round((Date.now() - started) / 1000)} s (${e?.message || e}). The build continues; see the [demo] lines above.`);
  }
} else if (demoMode) {
  console.warn(`[migrate] DEMO_DATA="${process.env.DEMO_DATA}" is not understood; use load or remove.`);
}
