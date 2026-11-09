/**
 * Optionally append Prisma pool params without parsing credentials.
 * Prefer setting these in DATABASE_URL yourself (especially for Supabase).
 * Do NOT run the URL through `new URL().toString()` — that can corrupt passwords.
 */
export function withPrismaPoolLimit(rawUrl, limit = 1) {
  const url = String(rawUrl || "").trim();
  if (!url || url.startsWith("file:") || /sqlite/i.test(url)) return url;

  let out = url;
  const sep = () => (out.includes("?") ? "&" : "?");

  if (!/[?&]connection_limit=/i.test(out)) {
    out += `${sep()}connection_limit=${Math.max(1, Math.min(10, Number(limit) || 1))}`;
  }
  if (/pooler\.supabase/i.test(out) && !/[?&]pgbouncer=true/i.test(out)) {
    out += `${sep()}pgbouncer=true`;
  }
  if (/supabase/i.test(out) && !/[?&]sslmode=/i.test(out)) {
    out += `${sep()}sslmode=require`;
  }
  return out;
}
