import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

// The locale router is next-intl's own; it is replaced here so only this project's logic runs.
vi.mock("next-intl/middleware", () => ({
  default: () => (request: NextRequest) =>
    new Response(null, { status: 307, headers: { location: `/en${request.nextUrl.pathname}` } }),
}));

const { default: proxy, apiRequestHeaders, FORWARDED_HEADERS } = await import("@/proxy");

const forged = { "x-forwarded-for": "203.0.113.9", "x-real-ip": "203.0.113.9", forwarded: "for=203.0.113.9" };

describe("forwarding headers on /api/*", () => {
  afterEach(() => {
    delete process.env.API_PROXY_KEEP_FORWARDED;
  });

  it("drops browser-sent address headers and keeps the rest", () => {
    const headers = apiRequestHeaders(new Headers({ ...forged, cookie: "a=b", "x-nennus-request": "1" }), false);
    for (const name of FORWARDED_HEADERS) expect(headers.get(name)).toBeNull();
    expect(headers.get("cookie")).toBe("a=b");
    expect(headers.get("x-nennus-request")).toBe("1");
  });

  it("keeps them only when a reverse proxy in front of this server is declared", () => {
    const headers = apiRequestHeaders(new Headers(forged), true);
    expect(headers.get("x-forwarded-for")).toBe("203.0.113.9");
  });

  it("applies to API requests through the middleware and leaves pages to the locale router", () => {
    const api = proxy(new NextRequest("http://127.0.0.1:3000/api/checkout", { headers: { ...forged, cookie: "a=b" } }));
    const overridden = api.headers.get("x-middleware-override-headers") ?? "";
    expect(overridden.split(",")).toContain("cookie");
    expect(api.headers.get("x-middleware-request-cookie")).toBe("a=b");
    for (const name of FORWARDED_HEADERS) {
      expect(overridden.split(",")).not.toContain(name);
      expect(api.headers.get(`x-middleware-request-${name}`)).toBeNull();
    }

    process.env.API_PROXY_KEEP_FORWARDED = "1";
    const kept = proxy(new NextRequest("http://127.0.0.1:3000/api/checkout", { headers: forged }));
    expect(kept.headers.get("x-middleware-request-x-forwarded-for")).toBe("203.0.113.9");

    const page = proxy(new NextRequest("http://127.0.0.1:3000/shop"));
    expect(page.status).toBe(307);
    expect(page.headers.get("location")).toBe("/en/shop");
  });
});
