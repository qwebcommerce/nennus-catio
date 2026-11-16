/**
 * Public website address used in customer links (verify, reset, payment return).
 * APP_PUBLIC_URL wins; then CLIENT_URL; then the Vercel production host; then the address the
 * customer's browser used. localhost is only a last resort for local development.
 */
export function publicBase(req) {
  const configured = process.env.APP_PUBLIC_URL?.trim() || process.env.CLIENT_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() || process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
  const origin = req?.headers?.origin;
  if (origin && /^https?:\/\/[^\s/]+$/.test(origin)) return origin;
  return "http://localhost:5173";
}
