import createMiddleware from "next-intl/middleware";
import { type NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";

const intl = createMiddleware(routing);

/**
 * Headers a browser could send to pretend to be another address. The `/api/*` rewrite forwards
 * request headers as received and does not add the visitor's own address, so the API would
 * otherwise believe them (review of 2026-10-09, H1). They are kept only when a reverse proxy in
 * front of this server sets them (`API_PROXY_KEEP_FORWARDED=1`, a #13 deployment setting).
 */
export const FORWARDED_HEADERS = ["x-forwarded-for", "x-real-ip", "forwarded"] as const;

export function apiRequestHeaders(incoming: Headers, keepForwarded: boolean): Headers {
  const headers = new Headers(incoming);
  if (!keepForwarded) for (const name of FORWARDED_HEADERS) headers.delete(name);
  return headers;
}

export default function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    const headers = apiRequestHeaders(request.headers, process.env.API_PROXY_KEEP_FORWARDED === "1");
    return NextResponse.next({ request: { headers } });
  }
  return intl(request);
}

export const config = { matcher: ["/api/:path*", "/((?!api|trpc|_next|_vercel|.*\\..*).*)"] };
