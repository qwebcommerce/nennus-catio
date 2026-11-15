import {
  type ApiErrorBody,
  type ApiErrorCode,
  apiErrorSchema,
  type BookingQuote,
  type CheckoutQuote,
  type PromoCodeStatus,
} from "@nennus-catio/contracts";
import type { ZodType } from "zod";

/** Server envelope codes plus the failures only the browser can see. */
export type ApiFailureCode = ApiErrorCode | "NETWORK" | "INVALID_RESPONSE" | "HTTP";

export class ApiError extends Error {
  readonly code: ApiFailureCode;
  readonly status: number | null;
  /** Field-level problems from VALIDATION_FAILED / CONFLICT, keyed by field path. */
  readonly fields: Readonly<Record<string, string>>;
  readonly retryAfterSeconds: number | null;
  /** PRICE_CHANGED from checkout (D207): the price for this checkout now. Show it, and send its total to confirm. */
  readonly quote: CheckoutQuote | null;
  /** PRICE_CHANGED from a booking (11c): the same, for the booking. */
  readonly bookingQuote: BookingQuote | null;
  /** PROMO_CODE_INVALID: why the code gives nothing, worded by the website in each language. */
  readonly codeStatus: PromoCodeStatus | null;
  constructor(
    code: ApiFailureCode,
    message: string,
    status: number | null = null,
    extra: Pick<ApiErrorBody, "fields" | "retryAfterSeconds" | "quote" | "bookingQuote" | "codeStatus"> = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.fields = Object.fromEntries((extra.fields ?? []).map((field) => [field.path, field.message]));
    this.retryAfterSeconds = extra.retryAfterSeconds ?? null;
    this.quote = extra.quote ?? null;
    this.bookingQuote = extra.bookingQuote ?? null;
    this.codeStatus = extra.codeStatus ?? null;
  }
}

/**
 * Per-request extras. `headers`: for example the private guest order key (7b). `cache`: checkout
 * reads prices and fees with "no-store" so a browser-cached answer can never hide a change.
 */
export interface RequestOptions {
  signal?: AbortSignal;
  headers?: Readonly<Record<string, string>>;
  cache?: RequestCache;
}

export interface ApiClient {
  /** GET `path` (relative to the `/api` base) and check the JSON body against `schema`. */
  get<T>(path: string, schema: ZodType<T>, options?: RequestOptions): Promise<T>;
  /** POST JSON with the CSRF header the API requires for every change. */
  post<T>(path: string, body: unknown, schema: ZodType<T>, options?: RequestOptions): Promise<T>;
  /** PUT JSON (replace a resource), with the CSRF header. */
  put<T>(path: string, body: unknown, schema: ZodType<T>, options?: { signal?: AbortSignal }): Promise<T>;
  /** DELETE, with the CSRF header. */
  delete<T>(path: string, schema: ZodType<T>, options?: { signal?: AbortSignal }): Promise<T>;
}

export interface ApiClientOptions {
  /** Same-origin by default: Next.js rewrites `/api/*` to the NestJS API, so cookies stay first-party. */
  baseUrl?: string;
  /** Injected for tests; the browser's fetch otherwise. */
  fetchImpl?: typeof fetch;
}

/** The API rejects state-changing requests without this header (CSRF protection, D97). */
export const CSRF_HEADER = "X-Nennus-Request";

const STATUS_CODES: Readonly<Record<number, ApiFailureCode>> = {
  400: "VALIDATION_FAILED",
  401: "UNAUTHENTICATED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  429: "RATE_LIMITED",
  503: "UNAVAILABLE",
};

/** A failed response as an ApiError. Exported for the few non-JSON reads (for example CSV downloads). */
export async function toApiError(response: Response): Promise<ApiError> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Not JSON (for example an HTML error page from a proxy); fall back to the status.
  }
  const envelope = apiErrorSchema.safeParse(body);
  if (envelope.success) {
    const { code, message, ...extra } = envelope.data;
    return new ApiError(code, message, response.status, extra);
  }
  return new ApiError(
    STATUS_CODES[response.status] ?? "HTTP",
    `The request failed with status ${response.status}.`,
    response.status,
  );
}

export function createApiClient({
  baseUrl = "/api",
  fetchImpl,
}: ApiClientOptions = {}): ApiClient {
  // Resolved lazily so a module-level client does not capture a test's stubbed fetch too early.
  const doFetch: typeof fetch = (input, init) => (fetchImpl ?? fetch)(input, init);

  async function send<T>(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    schema: ZodType<T>,
    body: unknown,
    { signal, headers: extraHeaders, cache }: RequestOptions = {},
  ): Promise<T> {
    const headers: Record<string, string> = { ...extraHeaders, Accept: "application/json" };
    if (method !== "GET") {
      headers["Content-Type"] = "application/json";
      headers[CSRF_HEADER] = "1";
    }
    let response: Response;
    try {
      response = await doFetch(`${baseUrl}${path}`, {
        method,
        headers,
        credentials: "same-origin",
        body: method === "GET" || method === "DELETE" ? undefined : JSON.stringify(body ?? {}),
        signal,
        ...(cache ? { cache } : {}),
      });
    } catch (error: unknown) {
      // A cancelled query must stay an AbortError so TanStack Query treats it as cancelled.
      if (signal?.aborted) throw error;
      throw new ApiError("NETWORK", "The server could not be reached.");
    }
    if (!response.ok) throw await toApiError(response);

    let parsedBody: unknown;
    try {
      parsedBody = await response.json();
    } catch {
      throw new ApiError("INVALID_RESPONSE", "The server response was not JSON.", response.status);
    }
    const parsed = schema.safeParse(parsedBody);
    if (!parsed.success) {
      throw new ApiError(
        "INVALID_RESPONSE",
        "The server response did not match the expected contract.",
        response.status,
      );
    }
    return parsed.data;
  }

  return {
    get: (path, schema, options) => send("GET", path, schema, undefined, options),
    post: (path, body, schema, options) => send("POST", path, schema, body, options),
    put: (path, body, schema, { signal } = {}) => send("PUT", path, schema, body, { signal }),
    delete: (path, schema, { signal } = {}) => send("DELETE", path, schema, undefined, { signal }),
  };
}
