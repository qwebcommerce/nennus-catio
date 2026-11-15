import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/**
 * Where this server forwards `/api/*`. Server-only (no NEXT_PUBLIC_ prefix): the browser only
 * ever sees same-origin `/api/...`, so cookies stay first-party and CORS is never needed.
 * In production the reverse proxy may route `/api/*` to the API directly; this rewrite then
 * simply never matches.
 */
function apiProxyOrigin(): string {
  const value = process.env.API_PROXY_ORIGIN ?? "http://127.0.0.1:3002";
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("API_PROXY_ORIGIN must be an absolute http(s) URL.");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("API_PROXY_ORIGIN must be an origin only, for example http://127.0.0.1:3002.");
  }
  return url.origin;
}

const config: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiProxyOrigin()}/api/:path*` }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};
export default withNextIntl(config);
