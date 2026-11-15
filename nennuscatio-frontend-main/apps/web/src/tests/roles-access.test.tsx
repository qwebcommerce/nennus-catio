import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  type AdminSiteSettings,
  emptyPermissions,
  normalisePermissions,
  ownerPermissions,
  type PermissionMap,
  type StaffProfile,
} from "@nennus-catio/contracts";
import en from "@/messages/en/common.json";
import { AdminSettingsApiPage } from "@/features/admin/settings/pages/AdminSettingsApiPage";
import { PermissionGrid, toggle } from "@/features/admin/team-access/components/RolesPanel";
import { firstAllowedHref, visibleNavigation } from "@/layouts/admin/navigation";
import { StaffIdentityProvider } from "@/layouts/global/GlobalProviders";
import { accessFromStaff, AdminAccessProvider } from "@/shared/access/AdminAccess";
import { type ApiClient, ApiError } from "@/shared/api/client";
import { SettingsProviders } from "./helpers/settings";

vi.mock("@/shared/ui/FeatureFoundation", () => ({ FeatureFoundation: () => <p>restricted</p> }));
afterEach(cleanup);

const view = { view: true, edit: false, delete: false, export: false, refund: false };

function staff(permissions: PermissionMap, isOwner = false): StaffProfile {
  return {
    id: "s1",
    email: "staff@example.invalid",
    displayName: "Sara",
    isOwner,
    mustChangePassword: false,
    roleName: isOwner ? null : "Front desk",
    permissions,
  };
}

describe("menu follows the role (D105)", () => {
  it("lists only the pages the role can view, and drops empty groups", () => {
    const access = accessFromStaff(staff(normalisePermissions({ orders: view, finance: view })));
    const groups = visibleNavigation(access.canView);
    expect(groups.map((group) => group.id)).toEqual(["business", "finance"]);
    expect(groups.flatMap((group) => group.items.map((item) => item.id))).toEqual(["orders", "finance"]);
  });

  it("never shows Team & Access to staff, even with every permission", () => {
    const allButOwner = accessFromStaff(staff(ownerPermissions()));
    expect(allButOwner.canView("team")).toBe(false);
    expect(accessFromStaff(staff(ownerPermissions(), true)).canView("team")).toBe(true);
  });

  it("sends a hidden page's address to the first allowed page", () => {
    const access = accessFromStaff(staff(normalisePermissions({ bookings: view, settings: view })));
    expect(firstAllowedHref(access.canView)).toBe("/admin/bookings");
    expect(firstAllowedHref(accessFromStaff(staff(emptyPermissions())).canView)).toBeNull();
  });
});

describe("role permission grid", () => {
  it("ticking an action ticks View; unticking View clears the row; Refund only on Orders/Bookings", () => {
    let map = toggle(emptyPermissions(), "orders", "refund", true);
    expect(map.orders).toEqual({ ...view, refund: true });
    map = toggle(map, "orders", "view", false);
    expect(map.orders).toEqual(emptyPermissions().orders);
    expect(toggle(emptyPermissions(), "settings", "refund", true).settings.refund).toBe(false);
  });

  it("renders one labelled checkbox per allowed action", () => {
    function Harness() {
      const [value, setValue] = useState(emptyPermissions());
      return <PermissionGrid value={value} onChange={setValue} />;
    }
    render(
      <SettingsProviders messages={{ Admin: en.Admin }}>
        <Harness />
      </SettingsProviders>,
    );
    // 13 modules × 4 actions + Refund on Orders, Bookings and Relocation (#15).
    expect(screen.getAllByRole("checkbox")).toHaveLength(13 * 4 + 3);
    expect(screen.getByRole("checkbox", { name: `${en.Admin.relocation} · Refund` })).toBeInTheDocument();
    const edit = screen.getByRole("checkbox", { name: `${en.Admin.orders} · Create / Edit` });
    fireEvent.click(edit);
    expect(screen.getByRole("checkbox", { name: `${en.Admin.orders} · View` })).toBeChecked();
    expect(screen.queryByRole("checkbox", { name: `${en.Admin.settings} · Refund` })).toBeNull();
  });
});

const settings: AdminSiteSettings = {
  headline: { en: "Hello", ar: "مرحبا" },
  description: { en: "Desc", ar: "وصف" },
  hours: { en: "9-9", ar: "٩-٩" },
  contact: { phone: "+97444445555", whatsapp: null },
  socialLinks: { instagram: null, instagramGrooming: null, instagramProjects: null, facebook: null },
  version: 4,
  updatedAt: "2026-10-07T07:00:00.000Z",
};

function settingsApi(put: () => unknown): ApiClient {
  return {
    get: async (_path, schema) => schema.parse(settings) as never,
    post: async () => {
      throw new ApiError("NOT_FOUND", "x", 404);
    },
    put: async (_path, _body, schema) => schema.parse(await put()) as never,
    delete: async () => {
      throw new ApiError("NOT_FOUND", "x", 404);
    },
  };
}

function settingsPage(api: ApiClient, permissions: PermissionMap) {
  return render(
    <SettingsProviders api={api}>
      <StaffIdentityProvider demoRole="core">
        <AdminAccessProvider staff={staff(permissions)}>
          <AdminSettingsApiPage />
        </AdminAccessProvider>
      </StaffIdentityProvider>
    </SettingsProviders>,
  );
}

describe("real Settings editor", () => {
  it("is read-only for a role with View but not Create/Edit", async () => {
    settingsPage(settingsApi(() => settings), normalisePermissions({ settings: view }));
    expect(await screen.findByText("Your role can view these settings but not change them.")).toBeTruthy();
    expect(screen.getByLabelText("Homepage headline · English")).toHaveAttribute("readonly");
    expect(screen.queryByRole("button", { name: "Save settings" })).toBeNull();
  });

  it("explains a simultaneous edit and offers a reload", async () => {
    settingsPage(
      settingsApi(() => {
        throw new ApiError("CONFLICT", "x", 409);
      }),
      normalisePermissions({ settings: { ...view, edit: true } }),
    );
    const headline = await screen.findByLabelText("Homepage headline · English");
    fireEvent.change(headline, { target: { value: "Changed" } });
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    expect(await screen.findByText(/Someone else saved the settings while you were editing/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reload settings" })).toBeTruthy();
  });

  it("edits the phone and WhatsApp as numbers: shown as people read them, sent as typed (D232)", async () => {
    let sent: { contact?: unknown; socialLinks?: object } = {};
    const api = settingsApi(() => ({ ...settings, contact: { phone: "+97444445555", whatsapp: "+97455551234" }, version: 5 }));
    const put = api.put;
    api.put = async (path, body, schema) => {
      sent = body as typeof sent;
      return put(path, body, schema);
    };
    settingsPage(api, normalisePermissions({ settings: { ...view, edit: true } }));
    const phone = await screen.findByLabelText("Phone number");
    expect(phone).toHaveValue("+974 4444 5555");
    expect(phone).toHaveAttribute("type", "tel");
    const whatsapp = screen.getByLabelText("WhatsApp number");
    expect(whatsapp).toHaveValue("");
    expect(screen.queryByLabelText("WhatsApp · HTTPS")).toBeNull();
    fireEvent.change(whatsapp, { target: { value: "5555 1234" } });
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    expect(await screen.findByText("Saved.")).toBeTruthy();
    expect(sent.contact).toEqual({ phone: "+974 4444 5555", whatsapp: "5555 1234" });
    expect(Object.keys(sent.socialLinks ?? {})).not.toContain("whatsapp");
    expect(screen.getByLabelText("WhatsApp number")).toHaveValue("+974 5555 1234");
  });

  it("highlights a number the server refuses and says how to write it", async () => {
    settingsPage(
      settingsApi(() => {
        throw new ApiError("VALIDATION_FAILED", "x", 400, { fields: [{ path: "contact.whatsapp", message: "Use a Qatari number" }] });
      }),
      normalisePermissions({ settings: { ...view, edit: true } }),
    );
    const whatsapp = await screen.findByLabelText("WhatsApp number");
    fireEvent.change(whatsapp, { target: { value: "+974 1234" } });
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    expect(await screen.findByText(/Please check the highlighted numbers/)).toBeTruthy();
    expect(screen.getByLabelText("WhatsApp number")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Phone number")).not.toHaveAttribute("aria-invalid");
  });
});
