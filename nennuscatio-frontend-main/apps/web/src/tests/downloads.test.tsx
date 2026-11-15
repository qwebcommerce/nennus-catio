// The download menu (#12 part 2, D196): CSV, Excel and PDF of a list, one at a time, Excel and PDF in the
// admin's language, the server's refusals worded in English and Arabic; Products and Promotions offer it
// only with their Export.
import {
  type AdminPromotionsResponse,
  normalisePermissions,
  type PermissionMap,
  type StaffProfile,
} from "@nennus-catio/contracts";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardDateProvider } from "@/features/admin/dashboard/components/DashboardDate";
import { CatalogueWorkspaceProvider } from "@/features/admin/products/CatalogueWorkspace";
import { AdminProductsPage } from "@/features/admin/products/pages/AdminProductsPage";
import { PromotionsWorkspaceProvider } from "@/features/admin/promotions/PromotionsWorkspace";
import { AdminPromotionsApiPage } from "@/features/admin/promotions/pages/AdminPromotionsApiPage";
import { StaffIdentityProvider } from "@/layouts/global/GlobalProviders";
import { MockDataProvider } from "@/mocks/MockDataProvider";
import { AdminAccessProvider } from "@/shared/access/AdminAccess";
import { type ApiClient, ApiError } from "@/shared/api/client";
import { DownloadMenu } from "@/shared/ui/DownloadMenu";
import { SettingsProviders } from "./helpers/settings";

vi.mock("@/shared/ui/FeatureFoundation", () => ({ FeatureFoundation: () => <p>restricted</p> }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, ...props }: ComponentProps<"a">) => <a {...props}>{children}</a>,
  useRouter: () => ({ push: vi.fn() }),
}));

const saved = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
let click: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
  URL.createObjectURL = vi.fn(() => "blob:download");
  URL.revokeObjectURL = vi.fn();
  click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  click.mockRestore();
  URL.createObjectURL = saved.create;
  URL.revokeObjectURL = saved.revoke;
  vi.unstubAllGlobals();
});

function file(name: string) {
  return new Response("file", { status: 200, headers: { "content-disposition": `attachment; filename="${name}"` } });
}

function refusal(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function renderMenu(props: Partial<Parameters<typeof DownloadMenu>[0]> = {}, locale: "en" | "ar" = "en") {
  const onError = vi.fn();
  render(
    <SettingsProviders locale={locale}>
      <DownloadMenu path="/admin/orders" search="sort=newest&status=confirmed" onError={onError} {...props} />
    </SettingsProviders>,
  );
  return { onError };
}

describe("the download menu", () => {
  it("downloads CSV at its old address, and Excel and PDF in the admin's language, under the server's file name", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) =>
      file(String(input).includes(".pdf") ? "orders-2026-10-14.pdf" : "orders-2026-10-14.xlsx"),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderMenu();
    expect(screen.getByRole("group", { name: "Download" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Download CSV" }));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Download Excel" }));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole("button", { name: "Download PDF" }));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(3));

    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([
      "/api/admin/orders/export.csv?sort=newest&status=confirmed",
      "/api/admin/orders/export.xlsx?sort=newest&status=confirmed&lang=en",
      "/api/admin/orders/export.pdf?sort=newest&status=confirmed&lang=en",
    ]);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ credentials: "same-origin" });
    const anchor = click.mock.contexts.at(-1) as HTMLAnchorElement;
    expect(anchor.download).toBe("orders-2026-10-14.pdf");
  });

  it("in Arabic: Arabic names, and Excel and PDF ask for Arabic; a list without filters has no stray ?", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => file("promotions.xlsx"));
    vi.stubGlobal("fetch", fetchMock);
    renderMenu({ path: "/admin/promotions", search: "" }, "ar");
    expect(screen.getByRole("group", { name: "تنزيل" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "تنزيل CSV" }));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "تنزيل Excel" }));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([
      "/api/admin/promotions/export.csv",
      "/api/admin/promotions/export.xlsx?lang=ar",
    ]);
    expect(screen.getByRole("button", { name: "تنزيل PDF" })).toBeTruthy();
  });

  it("one at a time: all three wait while one is prepared", async () => {
    let finish = (_response: Response) => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          }),
      ),
    );
    const { onError } = renderMenu();
    fireEvent.click(screen.getByRole("button", { name: "Download PDF" }));
    const preparing = await screen.findByRole("button", { name: "Preparing PDF…" });
    expect(preparing).toBeDisabled();
    expect(preparing).toHaveTextContent("PDF…");
    expect(screen.getByRole("button", { name: "Download CSV" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Download Excel" })).toBeDisabled();
    expect(onError).toHaveBeenLastCalledWith("");

    finish(file("orders.pdf"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Download PDF" })).toBeEnabled());
    expect(screen.getByRole("button", { name: "Download CSV" })).toBeEnabled();
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("words the server's refusals in the admin's language", async () => {
    const cases: [Response, string, string][] = [
      [
        refusal(429, { code: "DOWNLOAD_BUSY", message: "Another download is still being prepared." }),
        "Another download is still being prepared. Please wait for it to finish, then try again.",
        "لا يزال تنزيل آخر قيد التجهيز. يرجى الانتظار حتى ينتهي ثم المحاولة مرة أخرى.",
      ],
      [
        refusal(400, { code: "TOO_MANY_ROWS", message: "A PDF holds at most 2,000 rows, and this download has 2,345." }),
        "A PDF holds at most 2,000 rows. Narrow the filters, or download Excel.",
        "يتسع ملف PDF لـ 2,000 صف كحد أقصى. ضيّق عوامل التصفية أو نزّل ملف Excel.",
      ],
      [
        refusal(503, { code: "PDF_UNAVAILABLE", message: "PDF files cannot be made on this server yet." }),
        "PDF files cannot be made on this server yet. Please download Excel or CSV.",
        "لا يمكن إنشاء ملفات PDF على هذا الخادم بعد. يرجى تنزيل Excel أو CSV.",
      ],
      [
        refusal(503, { code: "PDF_TIMEOUT", message: "The PDF took too long." }),
        "The PDF took too long to prepare. Narrow the filters, or download Excel.",
        "استغرق تجهيز ملف PDF وقتاً طويلاً. ضيّق عوامل التصفية أو نزّل ملف Excel.",
      ],
      [
        refusal(400, {
          code: "VALIDATION_FAILED",
          message: "A download covers at most 366 days.",
          fields: [{ path: "to", message: "Choose at most 366 days." }],
        }),
        "A download covers at most 366 days. Please choose a shorter date range.",
        "يغطي التنزيل 366 يوماً كحد أقصى. يرجى اختيار فترة أقصر.",
      ],
      [
        refusal(403, { code: "FORBIDDEN", message: "You do not have access to this." }),
        "Your role cannot download this.",
        "لا يسمح دورك بتنزيل هذا.",
      ],
    ];
    for (const [response, english, arabic] of cases) {
      for (const [locale, expected] of [
        ["en", english],
        ["ar", arabic],
      ] as const) {
        vi.stubGlobal("fetch", vi.fn(async () => response.clone()));
        const { onError } = renderMenu({}, locale);
        fireEvent.click(screen.getByRole("button", { name: locale === "en" ? "Download PDF" : "تنزيل PDF" }));
        await waitFor(() => expect(onError).toHaveBeenLastCalledWith(expected));
        expect(click).not.toHaveBeenCalled();
        cleanup();
      }
    }
  });

  it("a network failure is worded too, and the menu can be switched off or renamed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    const { onError } = renderMenu({ name: (format) => `Download this day (${format})` });
    fireEvent.click(screen.getByRole("button", { name: "Download this day (Excel)" }));
    await waitFor(() => expect(onError).toHaveBeenLastCalledWith("The server could not be reached. Please try again."));
    cleanup();

    renderMenu({ disabled: true });
    for (const name of ["Download CSV", "Download Excel", "Download PDF"]) {
      expect(screen.getByRole("button", { name })).toBeDisabled();
    }
  });
});

// --- The two new downloads ----------------------------------------------------------------------------

const none = { view: false, edit: false, delete: false, export: false, refund: false };
const editing = { view: true, edit: true, delete: true, export: false, refund: false };
const exporting = { view: true, edit: false, delete: false, export: true, refund: false };

function staff(permissions: PermissionMap): StaffProfile {
  return { id: "s1", email: "staff@example.invalid", displayName: "Sara", isOwner: false, mustChangePassword: false, roleName: "Test", permissions };
}

const noPromotions: AdminPromotionsResponse = {
  today: "2026-10-14",
  promotions: [],
  counts: { all: 0, active: 0, scheduled: 0, ended: 0, inactive: 0, endingSoon: 0, usedThisMonth: 0 },
};

const api: ApiClient = {
  get: async (path, schema) =>
    schema.parse(
      path.includes("categories") ? { categories: [] } : path.startsWith("/admin/promotions") ? noPromotions : { products: [] },
    ) as never,
  post: async () => {
    throw new ApiError("NOT_FOUND", "x", 404);
  },
  put: async () => {
    throw new ApiError("NOT_FOUND", "x", 404);
  },
  delete: async () => {
    throw new ApiError("NOT_FOUND", "x", 404);
  },
};

function renderProducts(products: typeof none) {
  render(
    <SettingsProviders api={api}>
      <MockDataProvider>
        <StaffIdentityProvider demoRole="core">
          <AdminAccessProvider staff={staff(normalisePermissions({ products, groomingPackages: none }))}>
            <DashboardDateProvider>
              <CatalogueWorkspaceProvider>
                <AdminProductsPage />
              </CatalogueWorkspaceProvider>
            </DashboardDateProvider>
          </AdminAccessProvider>
        </StaffIdentityProvider>
      </MockDataProvider>
    </SettingsProviders>,
  );
}

function renderPromotions(promotions: typeof none) {
  render(
    <SettingsProviders api={api}>
      <StaffIdentityProvider demoRole="core">
        <AdminAccessProvider staff={staff(normalisePermissions({ promotions }))}>
          <PromotionsWorkspaceProvider>
            <AdminPromotionsApiPage />
          </PromotionsWorkspaceProvider>
        </AdminAccessProvider>
      </StaffIdentityProvider>
    </SettingsProviders>,
  );
}

describe("Products and Promotions downloads", () => {
  it("Products offers every pack's download only with Products Export", async () => {
    renderProducts(editing);
    await screen.findByRole("navigation", { name: "Catalogue sections" });
    expect(screen.queryByRole("group", { name: "Download" })).toBeNull();
    cleanup();

    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => file("products-2026-10-14.xlsx"));
    vi.stubGlobal("fetch", fetchMock);
    renderProducts(exporting);
    const menu = await screen.findByRole("group", { name: "Download" });
    fireEvent.click(within(menu).getByRole("button", { name: "Download Excel" }));
    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/api/admin/catalog/products/export.xlsx?lang=en");
  });

  it("Promotions offers the download only with Promotions Export, and shows a refusal on the page", async () => {
    renderPromotions(editing);
    await screen.findByText("Active promotions");
    expect(screen.queryByRole("group", { name: "Download" })).toBeNull();
    cleanup();

    vi.stubGlobal("fetch", vi.fn(async () => refusal(429, { code: "DOWNLOAD_BUSY", message: "Busy." })));
    renderPromotions(exporting);
    const menu = await screen.findByRole("group", { name: "Download" });
    fireEvent.click(within(menu).getByRole("button", { name: "Download PDF" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Another download is still being prepared.");
  });
});
