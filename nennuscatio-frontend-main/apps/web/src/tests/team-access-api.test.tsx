import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { StaffSummary } from "@nennus-catio/contracts";
import type { z } from "zod";
import { generateTemporaryPassword, TeamAccessApiPage } from "@/features/admin/team-access/pages/TeamAccessApiPage";
import { StaffIdentityProvider } from "@/layouts/global/GlobalProviders";
import { type ApiClient, ApiError } from "@/shared/api/client";
import { SettingsProviders } from "./helpers/settings";

vi.mock("@/shared/ui/FeatureFoundation", () => ({ FeatureFoundation: () => <p>restricted</p> }));
afterEach(cleanup);

const owner = {
  id: "0197a000-0000-7000-8000-000000000001",
  email: "owner@example.invalid",
  displayName: "Owner",
  isOwner: true,
  isActive: true,
  mustChangePassword: false,
  roleId: null,
  roleName: null,
  lastLoginAt: "2026-10-07T06:00:00.000Z",
  createdAt: "2026-10-01T06:00:00.000Z",
};

function fakeServer() {
  const staff: StaffSummary[] = [owner];
  let reauthenticated = false;
  const calls: { path: string; body: unknown }[] = [];
  const api: ApiClient = {
    get: async (path, schema) => {
      calls.push({ path: `GET ${path}`, body: undefined });
      if (path === "/admin/roles") return (schema as z.ZodType<unknown>).parse({ roles: [] }) as never;
      return (schema as z.ZodType<unknown>).parse({ staff }) as never;
    },
    put: async (path) => {
      throw new ApiError("NOT_FOUND", path, 404);
    },
    delete: async (path) => {
      throw new ApiError("NOT_FOUND", path, 404);
    },
    post: async (path, body, schema) => {
      calls.push({ path: `POST ${path}`, body });
      if (path === "/admin/auth/reauthenticate") {
        if ((body as { password: string }).password !== "owner passphrase") {
          throw new ApiError("INVALID_CREDENTIALS", "x", 400);
        }
        reauthenticated = true;
        return (schema as z.ZodType<unknown>).parse({ status: "ok" }) as never;
      }
      if (path === "/admin/staff") {
        if (!reauthenticated) throw new ApiError("REAUTH_REQUIRED", "x", 403);
        const request = body as { email: string; displayName: string };
        const created = {
          ...owner,
          id: "0197a000-0000-7000-8000-000000000002",
          email: request.email,
          displayName: request.displayName,
          isOwner: false,
          mustChangePassword: true,
          lastLoginAt: null,
        };
        staff.push(created);
        return (schema as z.ZodType<unknown>).parse(created) as never;
      }
      throw new ApiError("NOT_FOUND", path, 404);
    },
  };
  return { api, calls };
}

function page(api: ApiClient) {
  return render(
    <SettingsProviders api={api}>
      <StaffIdentityProvider demoRole="owner">
        <TeamAccessApiPage />
      </StaffIdentityProvider>
    </SettingsProviders>,
  );
}

describe("Team & Access against the API", () => {
  it("suggests random 16-character temporary passwords without look-alike characters", () => {
    const first = generateTemporaryPassword();
    expect(first).toMatch(/^[a-km-zA-HJ-NP-Z2-9]{16}$/);
    expect(generateTemporaryPassword()).not.toBe(first);
  });

  it("lists staff; the owner row has no actions", async () => {
    page(fakeServer().api);
    const row = (await screen.findByText("owner@example.invalid")).closest("tr") as HTMLElement;
    expect(within(row).getByText("Owner")).toBeTruthy();
    expect(within(row).getByText("Owner · everything")).toBeTruthy();
    expect(within(row).queryByRole("combobox")).toBeNull();
    expect(within(row).queryByRole("button")).toBeNull();
  });

  it("asks the owner to re-enter their password, then finishes creating the account and shows the hand-over", async () => {
    const { api, calls } = fakeServer();
    page(api);
    await screen.findByText("owner@example.invalid");
    fireEvent.click(screen.getByRole("button", { name: "Add staff member" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Sara" } });
    fireEvent.change(within(dialog).getByLabelText("Email"), { target: { value: "sara@example.invalid" } });
    const suggested = (within(dialog).getByLabelText("Temporary password") as HTMLInputElement).value;
    expect(suggested).toHaveLength(16);
    fireEvent.click(within(dialog).getByRole("button", { name: "Create account" }));

    const reauth = await screen.findByRole("dialog", { name: "Confirm it's you" });
    fireEvent.change(within(reauth).getByLabelText("Your password"), { target: { value: "wrong" } });
    fireEvent.click(within(reauth).getByRole("button", { name: "Confirm" }));
    expect(await within(reauth).findByText("The password is incorrect.")).toBeTruthy();

    fireEvent.change(within(reauth).getByLabelText("Your password"), { target: { value: "owner passphrase" } });
    fireEvent.click(within(reauth).getByRole("button", { name: "Confirm" }));

    const handOver = await screen.findByRole("dialog", { name: "Pass this on" });
    expect((within(handOver).getByLabelText("Temporary password") as HTMLInputElement).value).toBe(suggested);
    expect(await screen.findByText("sara@example.invalid", { selector: "bdi", ignore: "[role=dialog] *" })).toBeTruthy();
    const creates = calls.filter((call) => call.path === "POST /admin/staff");
    expect(creates).toHaveLength(2);
    expect(creates[1]?.body).toEqual({ email: "sara@example.invalid", displayName: "Sara", temporaryPassword: suggested });
  });

  it("deactivating a staff member asks first (D128); nothing is sent until confirmed", async () => {
    const { api, calls } = fakeServer();
    page(api);
    await screen.findByText("owner@example.invalid");
    // Create Sara first (with the owner's password), so there is a staff row with actions.
    fireEvent.click(screen.getByRole("button", { name: "Add staff member" }));
    const create = await screen.findByRole("dialog");
    fireEvent.change(within(create).getByLabelText("Name"), { target: { value: "Sara" } });
    fireEvent.change(within(create).getByLabelText("Email"), { target: { value: "sara@example.invalid" } });
    fireEvent.click(within(create).getByRole("button", { name: "Create account" }));
    const reauth = await screen.findByRole("dialog", { name: "Confirm it's you" });
    fireEvent.change(within(reauth).getByLabelText("Your password"), { target: { value: "owner passphrase" } });
    fireEvent.click(within(reauth).getByRole("button", { name: "Confirm" }));
    const handOver = await screen.findByRole("dialog", { name: "Pass this on" });
    fireEvent.keyDown(handOver, { key: "Escape" });

    fireEvent.click(await screen.findByRole("button", { name: "Deactivate Sara" }));
    const question = await screen.findByRole("dialog", { name: "Deactivate Sara?" });
    expect(within(question).getByText(/logged out at once/)).toBeTruthy();
    fireEvent.click(within(question).getByRole("button", { name: "Cancel" }));
    expect(calls.some((call) => call.path.endsWith("/deactivate"))).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Deactivate Sara" }));
    const again = await screen.findByRole("dialog", { name: "Deactivate Sara?" });
    fireEvent.click(within(again).getByRole("button", { name: "Deactivate" }));
    await vi.waitFor(() => expect(calls.some((call) => call.path.endsWith("/deactivate"))).toBe(true));
  });
});
