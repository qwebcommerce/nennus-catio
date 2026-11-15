// D128: every admin delete and risky change asks "Are you sure?"; nothing is sent until confirmed.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import {
  type AdminCategory,
  emptyPermissions,
  normalisePermissions,
  type Role,
  type StaffProfile,
} from "@nennus-catio/contracts";
import { CategoriesManager } from "@/features/admin/products/components/CategoriesManager";
import { RolesPanel } from "@/features/admin/team-access/components/RolesPanel";
import { StaffIdentityProvider } from "@/layouts/global/GlobalProviders";
import en from "@/messages/en/common.json";
import { AdminAccessProvider } from "@/shared/access/AdminAccess";
import type { ApiClient } from "@/shared/api/client";
import { ConfirmDialog, type ConfirmRequest } from "@/shared/ui/ConfirmDialog";
import { SettingsProviders } from "./helpers/settings";

vi.mock("@/shared/ui/FeatureFoundation", () => ({ FeatureFoundation: () => <p>restricted</p> }));
afterEach(cleanup);

function Harness({ run }: { run: () => void }) {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => setRequest({ title: "Delete the thing?", message: "It cannot be undone.", confirmLabel: "Delete thing", run })}
      >
        Delete
      </button>
      <ConfirmDialog request={request} onClose={() => setRequest(null)} />
    </>
  );
}

describe("the shared confirmation dialog", () => {
  it("does nothing on Cancel or Escape, and runs the action exactly once on confirm", async () => {
    const run = vi.fn();
    render(
      <SettingsProviders>
        <Harness run={run} />
      </SettingsProviders>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    let dialog = await screen.findByRole("dialog", { name: "Delete the thing?" });
    expect(within(dialog).getByText("It cannot be undone.")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    dialog = await screen.findByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(run).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete thing" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("real-mode dialogs no longer claim that changes only affect mock data", async () => {
    render(
      <SettingsProviders source="api">
        <Harness run={() => undefined} />
      </SettingsProviders>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await screen.findByRole("dialog");
    expect(screen.queryByText(/mock data/)).toBeNull();
  });
});

function stubApi(responses: Record<string, unknown>) {
  const deletes: string[] = [];
  const api: ApiClient = {
    get: async (path, schema) => schema.parse(responses[path]) as never,
    post: async () => {
      throw new Error("unexpected POST");
    },
    put: async () => {
      throw new Error("unexpected PUT");
    },
    delete: async (path, schema) => {
      deletes.push(path);
      return schema.parse({ status: "ok" }) as never;
    },
  };
  return { api, deletes };
}

const staffWith = (permissions: StaffProfile["permissions"]): StaffProfile => ({
  id: "s1",
  email: "staff@example.invalid",
  displayName: "Sara",
  isOwner: false,
  mustChangePassword: false,
  roleName: "Catalogue",
  permissions,
});

describe("delete asks first on the office-built admin pages", () => {
  it("roles: Delete opens the question; only the confirm button deletes", async () => {
    const role: Role = {
      id: "0197a000-0000-7000-8000-0000000000r1",
      name: "Cashier",
      description: "",
      isStarter: false,
      staffCount: 0,
      version: 1,
      permissions: emptyPermissions(),
    };
    const { api, deletes } = stubApi({});
    render(
      <SettingsProviders api={api} messages={{ Admin: en.Admin }}>
        <RolesPanel roles={[role]} run={(action) => action()} onChanged={async () => undefined} />
      </SettingsProviders>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete Cashier" }));
    const dialog = await screen.findByRole("dialog", { name: 'Delete the role "Cashier"?' });
    expect(deletes).toEqual([]);
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete role" }));
    await waitFor(() => expect(deletes).toEqual([`/admin/roles/${role.id}`]));
  });

  it("categories: Delete opens the question; Cancel keeps the category", async () => {
    const category: AdminCategory = {
      id: "0197a000-0000-7000-8000-0000000000c1",
      slug: "toys",
      name: { en: "Toys", ar: "ألعاب" },
      sortOrder: 40,
      active: true,
      productCount: 0,
      isHouseCategory: false,
    };
    const { api, deletes } = stubApi({ "/admin/catalog/categories": { categories: [category] } });
    render(
      <SettingsProviders api={api}>
        <StaffIdentityProvider demoRole="core">
          <AdminAccessProvider staff={staffWith(normalisePermissions({ products: { view: true, edit: true, delete: true, export: false, refund: false } }))}>
            <CategoriesManager onClose={() => undefined} />
          </AdminAccessProvider>
        </StaffIdentityProvider>
      </SettingsProviders>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Delete Toys" }));
    let dialog = await screen.findByRole("dialog", { name: 'Delete the category "Toys"?' });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: 'Delete the category "Toys"?' })).toBeNull());
    expect(deletes).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: "Delete Toys" }));
    dialog = await screen.findByRole("dialog", { name: 'Delete the category "Toys"?' });
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete category" }));
    await waitFor(() => expect(deletes).toEqual([`/admin/catalog/categories/${category.id}`]));
  });
});
