import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ApiError, createApiClient } from "@/shared/api/client";

const schema = z.object({ ok: z.boolean() });

function json(status: number, body: unknown): typeof fetch {
  return async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
}

async function failure(client: ReturnType<typeof createApiClient>): Promise<ApiError> {
  try {
    await client.get("/ping", schema);
  } catch (error) {
    if (error instanceof ApiError) return error;
    throw error;
  }
  throw new Error("expected the request to fail");
}

describe("typed API client", () => {
  it("requests same-origin /api paths as JSON and returns the parsed body", async () => {
    let request: { url: string; init?: RequestInit } | null = null;
    const client = createApiClient({
      fetchImpl: async (input, init) => {
        request = { url: String(input), init };
        return new Response(JSON.stringify({ ok: true, extra: "ignored" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });
    await expect(client.get("/ping", schema)).resolves.toEqual({ ok: true });
    expect(request).not.toBeNull();
    const { url, init } = request as unknown as { url: string; init: RequestInit };
    expect(url).toBe("/api/ping");
    expect(init.method).toBe("GET");
    expect(init.credentials).toBe("same-origin");
    expect(new Headers(init.headers).get("accept")).toBe("application/json");
  });

  it("rejects a 200 whose body does not match the contract", async () => {
    const error = await failure(createApiClient({ fetchImpl: json(200, { ok: "yes" }) }));
    expect(error.code).toBe("INVALID_RESPONSE");
    expect(error.status).toBe(200);
  });

  it("rejects a 200 that is not JSON", async () => {
    const error = await failure(
      createApiClient({
        fetchImpl: async () =>
          new Response("<html>proxy page</html>", {
            status: 200,
            headers: { "content-type": "text/html" },
          }),
      }),
    );
    expect(error.code).toBe("INVALID_RESPONSE");
  });

  it("uses the API error envelope when the server sends one", async () => {
    const error = await failure(
      createApiClient({
        fetchImpl: json(503, { code: "UNAVAILABLE", message: "Site settings are not available." }),
      }),
    );
    expect(error.code).toBe("UNAVAILABLE");
    expect(error.message).toBe("Site settings are not available.");
    expect(error.status).toBe(503);
  });

  it("keeps the price and the code's answer that come with PRICE_CHANGED and PROMO_CODE_INVALID (11e)", async () => {
    const quote = { lines: [], subtotal: 4230, discount: 635, deliveryFee: 0, houseDeliveryFee: 0, houseLeadDays: null, total: 3595, promotions: [], code: null };
    const changed = await failure(createApiClient({ fetchImpl: json(409, { code: "PRICE_CHANGED", message: "The total has changed.", quote }) }));
    expect(changed.quote).toEqual(quote);
    expect(changed.bookingQuote).toBeNull();
    const bookingQuote = { price: 8000, visitFee: 0, discount: 0, total: 8000, promotions: [], code: null };
    const moved = await failure(createApiClient({ fetchImpl: json(409, { code: "PRICE_CHANGED", message: "The total has changed.", bookingQuote }) }));
    expect(moved.bookingQuote).toEqual(bookingQuote);
    const refused = await failure(
      createApiClient({ fetchImpl: json(409, { code: "PROMO_CODE_INVALID", message: "This code has expired.", codeStatus: "ended" }) }),
    );
    expect([refused.code, refused.codeStatus, refused.quote]).toEqual(["PROMO_CODE_INVALID", "ended", null]);
  });

  it("falls back to the HTTP status for framework or proxy error bodies", async () => {
    const notFound = await failure(
      createApiClient({
        fetchImpl: json(404, { statusCode: 404, message: "Cannot GET /x", error: "Not Found" }),
      }),
    );
    expect(notFound.code).toBe("NOT_FOUND");
    expect(notFound.status).toBe(404);

    const gateway = await failure(
      createApiClient({
        fetchImpl: async () =>
          new Response("Bad Gateway", { status: 502, headers: { "content-type": "text/plain" } }),
      }),
    );
    expect(gateway.code).toBe("HTTP");
    expect(gateway.status).toBe(502);
  });

  it("reports a network failure without a status", async () => {
    const error = await failure(
      createApiClient({
        fetchImpl: async () => {
          throw new TypeError("Failed to fetch");
        },
      }),
    );
    expect(error.code).toBe("NETWORK");
    expect(error.status).toBeNull();
  });

  it("keeps a cancelled request an AbortError so the query layer treats it as cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    const client = createApiClient({
      fetchImpl: async (_input, init) => {
        init?.signal?.throwIfAborted();
        throw new Error("unreachable");
      },
    });
    await expect(client.get("/ping", schema, { signal: controller.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
  });
});
