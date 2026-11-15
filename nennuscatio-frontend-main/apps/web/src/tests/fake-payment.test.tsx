// 8b: the fake payment company's page (development only) that stands in for SkipCash until 8c.
import type { FakeGatewayPayment } from "@nennus-catio/contracts";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FakePaymentPage } from "@/features/payments/pages/FakePaymentPage";
import { type ApiClient, ApiError } from "@/shared/api/client";
import { paymentNavigation, returnPath } from "@/shared/api/payments";
import { SettingsProviders } from "./helpers/settings";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, ...props }: ComponentProps<"a">) => <a {...props}>{children}</a>,
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const ID = "fake_0197a000-0000-7000-8000-0000000000c1";
const RETURN = "http://127.0.0.1:3000/en/orders/NC-261010-4F7KQ2?payment=NC-261010-4F7KQ2-P1";

function fakePayment(overrides: Partial<FakeGatewayPayment> = {}): FakeGatewayPayment {
  return { providerPaymentId: ID, reference: "NC-261010-4F7KQ2-P1", amount: 18500, currency: "QAR", state: "open", returnUrl: RETURN, ...overrides };
}

function stubApi(view: () => FakeGatewayPayment, press?: (action: string) => FakeGatewayPayment) {
  const posts: string[] = [];
  const api: ApiClient = {
    get: async (_path, schema) => schema.parse(view()) as never,
    post: async (path, _body, schema) => {
      posts.push(path);
      const action = path.split("/").at(-1) ?? "";
      return schema.parse(press ? press(action) : view()) as never;
    },
    put: async () => {
      throw new Error("not used");
    },
    delete: async () => {
      throw new Error("not used");
    },
  };
  return { api, posts };
}

function renderPage(api: ApiClient) {
  return render(
    <SettingsProviders api={api}>
      <FakePaymentPage id={ID} />
    </SettingsProviders>,
  );
}

describe("fake payment page (development only)", () => {
  it("says it is a test, shows the amount, and Pay settles it and goes back to the order", async () => {
    const go = vi.spyOn(paymentNavigation, "go").mockImplementation(() => {});
    const { api, posts } = stubApi(() => fakePayment(), () => fakePayment({ state: "succeeded" }));
    renderPage(api);
    expect(await screen.findByRole("heading", { name: /Pay QAR\s?185\.00/ })).toBeTruthy();
    expect(screen.getByText(/no card is asked for and no money moves/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Pay QAR\s?185\.00$/ }));
    await waitFor(() => expect(go).toHaveBeenCalledWith("/en/orders/NC-261010-4F7KQ2?payment=NC-261010-4F7KQ2-P1"));
    expect(posts).toEqual([`/dev/fake-gateway/${ID}/pay`]);
  });

  it("every button settles the payment its own way: fails, lost notification, cancel", async () => {
    vi.spyOn(paymentNavigation, "go").mockImplementation(() => {});
    for (const [name, action] of [
      ["Payment fails", "fail"],
      ["Pay, but the notification is lost", "pay-without-webhook"],
      ["Cancel and go back", "cancel"],
    ] as const) {
      const { api, posts } = stubApi(() => fakePayment(), () => fakePayment({ state: action === "fail" ? "failed" : action === "cancel" ? "cancelled" : "succeeded" }));
      renderPage(api);
      fireEvent.click(await screen.findByRole("button", { name }));
      await waitFor(() => expect(posts).toEqual([`/dev/fake-gateway/${ID}/${action}`]));
      cleanup();
    }
  });

  it("a settled payment offers only the way back", async () => {
    const go = vi.spyOn(paymentNavigation, "go").mockImplementation(() => {});
    const { api, posts } = stubApi(() => fakePayment({ state: "failed" }));
    renderPage(api);
    expect(await screen.findByText("This test payment has already failed.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Pay/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Back to the order" }));
    expect(go).toHaveBeenCalledWith("/en/orders/NC-261010-4F7KQ2?payment=NC-261010-4F7KQ2-P1");
    expect(posts).toHaveLength(0);
  });

  it("a payment the API no longer knows (it restarted) says so", async () => {
    const { api } = stubApi(() => {
      throw new ApiError("NOT_FOUND", "This fake payment does not exist.", 404);
    });
    renderPage(api);
    expect(await screen.findByText(/disappear when it restarts/)).toBeTruthy();
  });

  it("the way back stays on this site, whatever address the payment was started with", () => {
    expect(returnPath("https://elsewhere.invalid/en/orders/NC-1?payment=P1")).toBe("/en/orders/NC-1?payment=P1");
    expect(returnPath("/ar/orders/NC-1")).toBe("/ar/orders/NC-1");
  });
});
