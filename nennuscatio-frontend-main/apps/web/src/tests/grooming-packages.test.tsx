// Grooming pet groups and packages (9a, D159-D160): the owner's admin page against the API, and the
// public /grooming page reading the real groups and packages.
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import {
  type AdminGroomingGroup,
  normalisePermissions,
  type PermissionMap,
  type PublicGroomingGroup,
  type StaffProfile,
} from "@nennus-catio/contracts";
import { parseKg, parseMonths } from "@/features/admin/grooming-packages/lib/grooming-form";
import { AdminGroomingPackagesPage } from "@/features/admin/grooming-packages/pages/AdminGroomingPackagesPage";
import { DashboardDateProvider } from "@/features/admin/dashboard/components/DashboardDate";
import { CatalogueWorkspaceProvider } from "@/features/admin/products/CatalogueWorkspace";
import { AdminProductsPage } from "@/features/admin/products/pages/AdminProductsPage";
import { ReferenceGroomingPage } from "@/features/grooming/pages/ReferenceGroomingPage";
import { StaffIdentityProvider } from "@/layouts/global/GlobalProviders";
import { MockDataProvider } from "@/mocks/MockDataProvider";
import { AdminAccessProvider } from "@/shared/access/AdminAccess";
import { type ApiClient, ApiError } from "@/shared/api/client";
import { SettingsProviders } from "./helpers/settings";

vi.mock("@/shared/ui/FeatureFoundation", () => ({ FeatureFoundation: () => <p>restricted</p> }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, ...props }: ComponentProps<"a">) => <a {...props}>{children}</a>,
  useRouter: () => ({ push: vi.fn() }),
}));
afterEach(cleanup);

const view = { view: true, edit: false, delete: false, export: false, refund: false };
const all = { view: true, edit: true, delete: true, export: false, refund: false };

const SMALL = "0199d000-0000-7000-8000-000000000001";
const DOGS = "0199d000-0000-7000-8000-000000000002";
const BASIC = "0199d000-0000-7000-8000-0000000000b1";
const FULL = "0199d000-0000-7000-8000-0000000000f1";
const stamp = "2026-10-11T08:00:00.000Z";

const groups: AdminGroomingGroup[] = [
  {
    id: SMALL,
    name: { en: "Small pet", ar: "حيوان صغير" },
    audience: { en: "Rabbits and guinea pigs", ar: "الأرانب وخنازير غينيا" },
    ageMonths: { min: null, max: null },
    weightGrams: { min: null, max: 5000 },
    sortOrder: 0,
    active: true,
    isSample: true,
    version: 1,
    updatedAt: stamp,
    packages: [
      {
        id: BASIC,
        groupId: SMALL,
        name: { en: "Basic", ar: "أساسي" },
        description: { en: "A bath.", ar: "استحمام." },
        included: { en: ["Bath & blow dry"], ar: ["استحمام وتجفيف"] },
        price: 8000,
        durationMinutes: 45,
        image: null,
        code: "GRM-BASIC",
        sortOrder: 0,
        active: true,
        isSample: true,
        version: 2,
        updatedAt: stamp,
      },
      {
        id: FULL,
        groupId: SMALL,
        name: { en: "Full", ar: "كامل" },
        description: { en: "", ar: "" },
        included: { en: [], ar: [] },
        price: 13000,
        durationMinutes: 90,
        image: null,
        code: null,
        sortOrder: 1,
        active: false,
        isSample: false,
        version: 1,
        updatedAt: stamp,
      },
    ],
  },
  {
    id: DOGS,
    name: { en: "Big dogs", ar: "كلاب كبيرة" },
    audience: { en: "", ar: "" },
    ageMonths: { min: 12, max: null },
    weightGrams: { min: 20000, max: 60000 },
    sortOrder: 1,
    active: true,
    isSample: false,
    version: 4,
    updatedAt: stamp,
    packages: [],
  },
];

function staff(permissions: PermissionMap): StaffProfile {
  return { id: "s1", email: "staff@example.invalid", displayName: "Sara", isOwner: false, mustChangePassword: false, roleName: "Grooming", permissions };
}

function stubApi(answer: (method: string, path: string, body: unknown) => unknown = () => ({ groups })) {
  const calls: { method: string; path: string; body: unknown }[] = [];
  const respond = (method: string, path: string, body: unknown) => {
    calls.push({ method, path, body });
    return answer(method, path, body);
  };
  const api: ApiClient = {
    get: async (_path, schema) => schema.parse({ groups }) as never,
    post: async (path, body, schema) => schema.parse(respond("POST", path, body)) as never,
    put: async (path, body, schema) => schema.parse(respond("PUT", path, body)) as never,
    delete: async (path, schema) => schema.parse(respond("DELETE", path, null)) as never,
  };
  return { api, calls };
}

function renderAdmin(api: ApiClient, permissions: PermissionMap) {
  return render(
    <SettingsProviders api={api}>
      <MockDataProvider>
        <StaffIdentityProvider demoRole="core">
          <AdminAccessProvider staff={staff(permissions)}>
            <AdminGroomingPackagesPage />
          </AdminAccessProvider>
        </StaffIdentityProvider>
      </MockDataProvider>
    </SettingsProviders>,
  );
}

describe("grooming form values", () => {
  it("reads ages as whole months and weights as kg, empty meaning no limit", () => {
    expect(parseMonths("")).toBeNull();
    expect(parseMonths(" 12 ")).toBe(12);
    expect(parseMonths("1.5")).toBeUndefined();
    expect(parseKg("")).toBeNull();
    expect(parseKg("2.5")).toBe(2500);
    expect(parseKg("60")).toBe(60000);
    for (const bad of ["abc", "-1", "1.2345", "2,5"]) expect(parseKg(bad)).toBeUndefined();
  });
});

describe("admin grooming packages (API mode)", () => {
  it("lists each group with its limits and packages; view-only roles get no buttons", async () => {
    const { api } = stubApi();
    renderAdmin(api, normalisePermissions({ groomingPackages: view }));
    const small = await screen.findByRole("region", { name: "Small pet" });
    // Only the age limits show; a group's stored weight limits are hidden (D246).
    expect(within(small).getByText(/Rabbits and guinea pigs · Sample/)).toBeTruthy();
    expect(within(small).getByText(/QAR\s?80\.00 · 45 min · Sample/)).toBeTruthy();
    expect(within(small).getByText(/QAR\s?130\.00 · 90 min · Hidden/)).toBeTruthy();
    const dogs = screen.getByRole("region", { name: "Big dogs" });
    expect(within(dogs).getByText(/Age: From 12 months/)).toBeTruthy();
    expect(screen.queryByText(/Weight/)).toBeNull();
    expect(screen.queryByRole("button", { name: /Edit|Add|Delete/ })).toBeNull();
  });

  it("a group is deleted with its packages after a question that names them (D260); an empty group says it has none", async () => {
    const { api, calls } = stubApi((method) => ({ groups: method === "DELETE" ? groups.slice(1) : groups }));
    renderAdmin(api, normalisePermissions({ groomingPackages: all }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete group Small pet" }));
    const question = await screen.findByRole("dialog", { name: 'Delete the pet group "Small pet"?' });
    expect(question.textContent).toContain("Its 2 packages are deleted with it: Basic, Full.");
    expect(question.textContent).toContain("Bookings already made keep their own copy.");
    expect(question.textContent).toContain("A promotion that chose only these packages will no longer apply.");
    expect(screen.queryByText(/delete or move its packages first/)).toBeNull();
    expect(calls).toHaveLength(0);
    fireEvent.click(within(question).getByRole("button", { name: "Delete group" }));
    await waitFor(() => expect(calls).toEqual([{ method: "DELETE", path: `/admin/grooming/groups/${SMALL}`, body: null }]));
    expect(await screen.findByText('Pet group "Small pet" and its 2 packages deleted.')).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Delete group Big dogs" }));
    const empty = await screen.findByRole("dialog", { name: 'Delete the pet group "Big dogs"?' });
    expect(empty.textContent).toContain("It has no packages.");
  });

  it("without the Delete permission no group or package can be deleted", async () => {
    const { api } = stubApi();
    renderAdmin(api, normalisePermissions({ groomingPackages: { ...all, delete: false } }));
    expect(await screen.findByRole("button", { name: "Edit group Small pet" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Delete/ })).toBeNull();
  });

  it("adding a package sends QAR as dirhams, the minutes and one included item per line", async () => {
    const { api, calls } = stubApi();
    renderAdmin(api, normalisePermissions({ groomingPackages: all }));
    fireEvent.click(await screen.findByRole("button", { name: "Add package in Big dogs" }));
    const dialog = await screen.findByRole("dialog", { name: "New package" });
    fireEvent.change(within(dialog).getByLabelText("Name · English"), { target: { value: "Bath only" } });
    fireEvent.change(within(dialog).getByLabelText("Name · Arabic"), { target: { value: "استحمام فقط" } });
    fireEvent.change(within(dialog).getByLabelText("What is included · English (one per line)"), { target: { value: "Bath\n\n Nails \n" } });
    fireEvent.change(within(dialog).getByLabelText("Length (minutes, 15-240)"), { target: { value: "60" } });
    fireEvent.change(within(dialog).getByLabelText("Price (QAR)"), { target: { value: "0" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save package" }));
    expect(await within(dialog).findByText(/Enter a price above 0 in QAR/)).toBeTruthy();
    expect(calls).toHaveLength(0);

    fireEvent.change(within(dialog).getByLabelText("Price (QAR)"), { target: { value: "120.50" } });
    // The POS item code is written like a SKU (#16 part 2a): a space is refused before anything is sent.
    const code = within(dialog).getByLabelText("POS item code (optional; bookings carry it to the POS)");
    fireEvent.change(code, { target: { value: "BATH ONLY" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save package" }));
    expect(await within(dialog).findByText(/Enter the POS item code as it is there/)).toBeTruthy();
    expect(calls).toHaveLength(0);

    fireEvent.change(code, { target: { value: " GRM-BATH-01 " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save package" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: "/admin/grooming/packages",
      body: {
        groupId: DOGS,
        name: { en: "Bath only", ar: "استحمام فقط" },
        included: { en: ["Bath", "Nails"], ar: [] },
        price: 12050,
        durationMinutes: 60,
        image: null,
        code: "GRM-BATH-01",
        active: true,
      },
    });
    expect(await screen.findByText('Package "Bath only" saved.')).toBeTruthy();
  });

  it("hiding a package asks first and saves with the version it was opened at", async () => {
    const { api, calls } = stubApi();
    renderAdmin(api, normalisePermissions({ groomingPackages: all }));
    fireEvent.click(await screen.findByRole("button", { name: "Edit Basic · Small pet" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit package" });
    expect(within(dialog).getByLabelText("Price (QAR)")).toHaveValue("80.00");
    fireEvent.click(within(dialog).getByLabelText("Offer this package to customers"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save package" }));
    const question = await screen.findByRole("dialog", { name: 'Hide the package "Basic"?' });
    expect(question.textContent).toContain("Customers will no longer see it");
    expect(calls).toHaveLength(0);
    fireEvent.click(within(question).getByRole("button", { name: "Hide package" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({ method: "PUT", path: `/admin/grooming/packages/${BASIC}`, body: { version: 2, active: false, price: 8000, groupId: SMALL, code: "GRM-BASIC" } });
  });

  it("deleting a package asks first; someone else's edit is explained plainly", async () => {
    const { api, calls } = stubApi((method) => {
      if (method === "PUT") throw new ApiError("CONFLICT", "Someone else changed this pet group. Reload to see the latest version.", 409);
      return { groups };
    });
    renderAdmin(api, normalisePermissions({ groomingPackages: all }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete Full · Small pet" }));
    const question = await screen.findByRole("dialog", { name: 'Delete the package "Full"?' });
    expect(question.textContent).toContain("Bookings already made keep their own copy");
    expect(calls).toHaveLength(0);
    fireEvent.click(within(question).getByRole("button", { name: "Delete package" }));
    await waitFor(() => expect(calls[0]).toEqual({ method: "DELETE", path: `/admin/grooming/packages/${FULL}`, body: null }));

    fireEvent.click(screen.getByRole("button", { name: "Edit group Big dogs" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit pet group" });
    expect(within(dialog).queryByLabelText(/weight/)).toBeNull();
    // Letters never land (D230); an age the page cannot read is still explained before sending.
    fireEvent.change(within(dialog).getByLabelText("Youngest age (months, empty = no limit)"), { target: { value: "one" } });
    expect(within(dialog).getByLabelText("Youngest age (months, empty = no limit)")).toHaveValue("");
    fireEvent.change(within(dialog).getByLabelText("Youngest age (months, empty = no limit)"), { target: { value: "1234" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save group" }));
    expect(await within(dialog).findByText(/Enter ages as whole months/)).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText("Youngest age (months, empty = no limit)"), { target: { value: "6" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save group" }));
    await waitFor(() => expect(calls).toHaveLength(2));
    // The hidden weight limits go back as they were stored (D246).
    expect(calls[1]).toMatchObject({ method: "PUT", path: `/admin/grooming/groups/${DOGS}`, body: { version: 4, ageMonths: { min: 6, max: null }, weightGrams: { min: 20000, max: 60000 } } });
    expect(await within(dialog).findByText(/Someone else changed this while you were editing/)).toBeTruthy();
  });
});

describe("the Products page in API mode", () => {
  it("its Services tab opens the Grooming packages page instead of the demo packages", async () => {
    const api: ApiClient = {
      ...stubApi().api,
      get: async (path, schema) => schema.parse(path.includes("categories") ? { categories: [] } : { products: [] }) as never,
    };
    render(
      <SettingsProviders api={api}>
        <MockDataProvider>
          <StaffIdentityProvider demoRole="core">
            <AdminAccessProvider staff={staff(normalisePermissions({ products: all, groomingPackages: all }))}>
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
    const tabs = await screen.findByRole("navigation", { name: "Catalogue sections" });
    const services = within(tabs).getByRole("link", { name: "Services" });
    expect(services).toHaveAttribute("href", "/admin/grooming-packages");
    expect(within(tabs).queryByRole("button", { name: /Services/ })).toBeNull();
  });
});

describe("/grooming against the API", () => {
  const publicGroups: PublicGroomingGroup[] = groups.map(({ id, name, audience, ageMonths, weightGrams, packages }) => ({
    id,
    name,
    audience,
    ageMonths,
    weightGrams,
    packages: packages
      .filter((item) => item.active)
      .map(({ id: packageId, name: packageName, description, included, price, durationMinutes, image }) => ({
        id: packageId,
        name: packageName,
        description,
        included,
        price,
        durationMinutes,
        image,
      })),
  }));

  it("offers the owner's groups and packages in the booking steps (9e books them)", async () => {
    const asked: string[] = [];
    const api: ApiClient = {
      ...stubApi().api,
      get: async (path, schema) => {
        asked.push(path);
        if (path === "/auth/me") throw new ApiError("UNAUTHENTICATED", "Please log in.", 401);
        if (path === "/grooming/areas") return schema.parse({ areas: [] }) as never;
        expect(path).toBe("/grooming/packages");
        return schema.parse({ groups: publicGroups.filter((group) => group.packages.length > 0) }) as never;
      },
    };
    render(
      <SettingsProviders api={api}>
        <MockDataProvider>
          <ReferenceGroomingPage />
        </MockDataProvider>
      </SettingsProviders>,
    );
    fireEvent.click(await screen.findByRole("button", { name: /Continue to pet/ }));
    expect(await screen.findByRole("button", { name: "Small pet", pressed: true })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Kitty" })).toBeNull();
    expect(screen.getByText("Rabbits and guinea pigs")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Continue to package/ }));
    const basic = await screen.findByRole("button", { name: /^Basic\s*QAR\s?80\.00 · 45 min$/ });
    expect(basic).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: /^Full/ })).toBeNull();
    expect(screen.getByText("Bath & blow dry")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Choose a date/ })).toBeEnabled();
    expect(screen.queryByRole("link", { name: /See available times/ })).toBeNull();
    expect(asked).toContain("/grooming/packages");
  });
});
