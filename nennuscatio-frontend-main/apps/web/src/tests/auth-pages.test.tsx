import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { emptyPermissions, normalisePermissions, ownerPermissions } from "@nennus-catio/contracts";
import { z } from "zod";
import { LoginPage } from "@/features/account/pages/LoginPage";
import { RegisterPage } from "@/features/account/pages/RegisterPage";
import { safeNext } from "@/features/admin/auth/pages/StaffLoginPage";
import { StaffGate } from "@/features/admin/auth/StaffGate";
import { type ApiClient, ApiError, createApiClient } from "@/shared/api/client";
import { customerLoginHref, safeCustomerNext } from "@/shared/lib/customer-login";
import { SettingsProviders } from "./helpers/settings";

const replace = vi.fn();
let pathname = "/admin/orders";
let search = new URLSearchParams();
vi.mock("next/navigation", () => ({ useSearchParams: () => search }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: ComponentProps<"a"> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  usePathname: () => pathname,
  useRouter: () => ({ replace, push: replace }),
}));

beforeEach(() => {
  replace.mockReset();
  pathname = "/admin/orders";
  search = new URLSearchParams();
});
afterEach(cleanup);

/** A client stub: `routes` maps "METHOD /path" to a handler returning the body or throwing. */
function stubApi(routes: Record<string, (body: unknown) => unknown>): ApiClient & { calls: string[] } {
  const calls: string[] = [];
  const handle = async (key: string, body: unknown, schema: z.ZodType<unknown>) => {
    calls.push(key);
    const route = routes[key];
    if (!route) throw new ApiError("NOT_FOUND", `No stub for ${key}`, 404);
    return schema.parse(await route(body));
  };
  return {
    calls,
    get: (path, schema) => handle(`GET ${path}`, undefined, schema) as never,
    post: (path, body, schema) => handle(`POST ${path}`, body, schema) as never,
    put: (path, body, schema) => handle(`PUT ${path}`, body, schema) as never,
    delete: (path, schema) => handle(`DELETE ${path}`, undefined, schema) as never,
  };
}

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe("API client changes", () => {
  it("sends JSON with the CSRF header and same-origin credentials", async () => {
    let init: RequestInit | undefined;
    const client = createApiClient({
      fetchImpl: async (_url, requestInit) => {
        init = requestInit;
        return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
      },
    });
    await client.post("/auth/logout", { a: 1 }, z.object({ status: z.literal("ok") }));
    const headers = new Headers(init?.headers);
    expect(init?.method).toBe("POST");
    expect(headers.get("x-nennus-request")).toBe("1");
    expect(headers.get("content-type")).toBe("application/json");
    expect(init?.credentials).toBe("same-origin");
    expect(init?.body).toBe('{"a":1}');
  });

  it("exposes field errors and the wait time from the error envelope", async () => {
    const client = createApiClient({
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            code: "VALIDATION_FAILED",
            message: "Please check the highlighted fields.",
            fields: [{ path: "password", message: "Too small" }],
          }),
          { status: 400 },
        ),
    });
    const error = await client.post("/auth/register", {}, z.object({})).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).fields).toEqual({ password: "Too small" });

    const limited = createApiClient({
      fetchImpl: async () =>
        new Response(JSON.stringify({ code: "RATE_LIMITED", message: "Wait", retryAfterSeconds: 900 }), { status: 429 }),
    });
    const throttled = (await limited.post("/auth/login", {}, z.object({})).catch((e: unknown) => e)) as ApiError;
    expect(throttled.code).toBe("RATE_LIMITED");
    expect(throttled.retryAfterSeconds).toBe(900);
  });
});

describe("customer register and login pages", () => {
  it("register shows 'check your inbox' and sends the page language", async () => {
    let sent: unknown;
    const api = stubApi({
      "POST /auth/register": (body) => {
        sent = body;
        return { status: "accepted" };
      },
    });
    render(
      <SettingsProviders api={api} locale="ar">
        <RegisterPage />
      </SettingsProviders>,
    );
    fill("البريد الإلكتروني", "someone@gmail.com");
    fill("كلمة المرور", "a long enough passphrase");
    fireEvent.click(screen.getByRole("button", { name: "أنشئ الحساب" }));
    expect(await screen.findByRole("heading", { name: "تحقق من بريدك" })).toBeTruthy();
    expect(sent).toEqual({ email: "someone@gmail.com", password: "a long enough passphrase", locale: "ar" });
  });

  it("register shows the API's field error next to the password", async () => {
    const api = stubApi({
      "POST /auth/register": () => {
        throw new ApiError("VALIDATION_FAILED", "Please check", 400, {
          fields: [{ path: "password", message: "Password must not be your email address." }],
        });
      },
    });
    render(
      <SettingsProviders api={api}>
        <RegisterPage />
      </SettingsProviders>,
    );
    fill("Email", "same@example.invalid");
    fill("Password", "same@example.invalid");
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByText("The password must not be your email address.")).toBeTruthy();
    expect(screen.getByLabelText("Password")).toHaveAttribute("aria-invalid", "true");
  });

  it("login: wrong password message, then an unverified account can resend the link", async () => {
    let attempt = 0;
    const api = stubApi({
      "POST /auth/login": () => {
        attempt += 1;
        if (attempt === 1) throw new ApiError("INVALID_CREDENTIALS", "x", 401);
        throw new ApiError("EMAIL_NOT_VERIFIED", "x", 403);
      },
      "POST /auth/resend-verification": () => ({ status: "accepted" }),
    });
    render(
      <SettingsProviders api={api}>
        <LoginPage />
      </SettingsProviders>,
    );
    fill("Email", "someone@example.invalid");
    fill("Password", "whatever passphrase");
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));
    expect(await screen.findByText("The email or password is incorrect.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Log in" }));
    fireEvent.click(await screen.findByRole("button", { name: "Send the confirmation link again" }));
    expect(await screen.findByText(/a new link is on its way/)).toBeTruthy();
    expect(api.calls).toContain("POST /auth/resend-verification");
  });

  it("login success goes to My account", async () => {
    const api = stubApi({
      "POST /auth/login": () => ({ id: "c1", email: "someone@example.invalid", emailVerified: true }),
    });
    render(
      <SettingsProviders api={api}>
        <LoginPage />
      </SettingsProviders>,
    );
    fill("Email", "someone@example.invalid");
    fill("Password", "right passphrase");
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/account"));
  });

  it("login returns to the page the customer came from: an order, My orders or checkout (review M8)", async () => {
    for (const next of ["/orders/NC-261009-4F7KQ2", "/account/orders", "/checkout"]) {
      replace.mockReset();
      search = new URLSearchParams({ next });
      const api = stubApi({
        "POST /auth/login": () => ({ id: "c1", email: "someone@example.invalid", emailVerified: true }),
      });
      render(
        <SettingsProviders api={api}>
          <LoginPage />
        </SettingsProviders>,
      );
      fill("Email", "someone@example.invalid");
      fill("Password", "right passphrase");
      fireEvent.click(screen.getByRole("button", { name: "Log in" }));
      await waitFor(() => expect(replace).toHaveBeenCalledWith(next));
      cleanup();
    }
  });

  it("only returns to the shop's own account, order and checkout pages (no open redirect)", () => {
    for (const allowed of ["/account", "/account/orders", "/checkout", "/orders/NC-261009-4F7KQ2"]) {
      expect(safeCustomerNext(allowed)).toBe(allowed);
    }
    for (const refused of [
      null,
      "",
      "https://evil.example.invalid",
      "//evil.example.invalid/orders/NC-261009-4F7KQ2",
      "/\\evil.example.invalid",
      "/account/login",
      "/admin",
      "/en/account",
      "/orders/NC-BAD",
      "/orders/NC-261009-4F7KQ2/../../admin",
      "/orders/NC-261009-4F7KQ2?x=1",
    ]) {
      expect(safeCustomerNext(refused)).toBe("/account");
    }
    expect(customerLoginHref("/orders/NC-261009-4F7KQ2")).toBe("/account/login?next=%2Forders%2FNC-261009-4F7KQ2");
  });
});

describe("staff gate", () => {
  const owner = {
    id: "o",
    email: "owner@example.invalid",
    displayName: "Owner",
    isOwner: true,
    mustChangePassword: false,
    roleName: null,
    permissions: ownerPermissions(),
  };

  function gate(api: ApiClient) {
    return render(
      <SettingsProviders api={api}>
        <StaffGate>{(staff) => <p>Shell for {staff.displayName}</p>}</StaffGate>
      </SettingsProviders>,
    );
  }

  it("sends a visitor without a staff session to the login page, remembering where they were", async () => {
    gate(stubApi({ "GET /admin/auth/me": () => { throw new ApiError("UNAUTHENTICATED", "x", 401); } }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/admin/login?next=%2Fadmin%2Forders"));
    expect(screen.queryByText(/Shell for/)).toBeNull();
  });

  it("forces a temporary password to be changed first", async () => {
    gate(stubApi({ "GET /admin/auth/me": () => ({ ...owner, mustChangePassword: true }) }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/admin/change-password"));
    expect(screen.queryByText(/Shell for/)).toBeNull();
  });

  it("shows staff without a role an 'access being set up' page (deny by default)", async () => {
    gate(
      stubApi({
        "GET /admin/auth/me": () => ({ ...owner, displayName: "Sara", isOwner: false, permissions: emptyPermissions() }),
      }),
    );
    expect(await screen.findByRole("heading", { name: "Your access is being set up" })).toBeTruthy();
    expect(screen.queryByText(/Shell for/)).toBeNull();
    expect(screen.getByRole("button", { name: "Log out" })).toBeTruthy();
  });

  it("lets staff whose role shows at least one page into the shell", async () => {
    const view = { view: true, edit: false, delete: false, export: false, refund: false };
    gate(
      stubApi({
        "GET /admin/auth/me": () => ({
          ...owner,
          displayName: "Sara",
          isOwner: false,
          roleName: "Front desk",
          permissions: normalisePermissions({ orders: view }),
        }),
      }),
    );
    expect(await screen.findByText("Shell for Sara")).toBeTruthy();
  });

  it("lets the owner into the shell", async () => {
    gate(stubApi({ "GET /admin/auth/me": () => owner }));
    expect(await screen.findByText("Shell for Owner")).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it("only returns to admin pages after login (no open redirect)", () => {
    expect(safeNext("/admin/team")).toBe("/admin/team");
    expect(safeNext(null)).toBe("/admin");
    expect(safeNext("https://evil.example.invalid")).toBe("/admin");
    expect(safeNext("//evil.example.invalid/admin")).toBe("/admin");
    expect(safeNext("/admin/login")).toBe("/admin");
    expect(safeNext("/shop")).toBe("/admin");
  });
});
