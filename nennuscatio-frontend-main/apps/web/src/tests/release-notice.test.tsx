// "A new version is ready" (13b): an open admin tab offers a reload once the site runs a newer release,
// and never reloads or nags by itself.
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/release.json/route";
import { ReleaseNotice } from "@/layouts/admin/ReleaseNotice";
import { SettingsProviders } from "./helpers/settings";

const EVERY = 120_000;
let visibility: DocumentVisibilityState = "visible";

beforeEach(() => {
  vi.useFakeTimers();
  visibility = "visible";
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("/release.json", () => {
  it("answers the release the website was built from, never from a cache", async () => {
    vi.stubEnv("NEXT_PUBLIC_RELEASE", "c63b083a93f9");
    const response = GET();
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ release: "c63b083a93f9" });
  });

  it("answers none for a development build", async () => {
    vi.stubEnv("NEXT_PUBLIC_RELEASE", "");
    expect(await GET().json()).toEqual({ release: null });
  });
});

/** The site answers each check with the next of these: a release, a broken body, or a failure. */
function siteAnswers(...answers: Array<string | null | "broken" | "down" | 500>) {
  const queue = [...answers];
  return vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    const next = queue.length > 1 ? queue.shift() : queue[0];
    if (next === "down") throw new TypeError("Failed to fetch");
    if (next === 500) return new Response("", { status: 500 });
    if (next === "broken") return new Response("<html>", { status: 200 });
    return Response.json({ release: next });
  });
}

async function wait(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function show(built: string | undefined, locale: "en" | "ar" = "en") {
  render(
    <SettingsProviders locale={locale}>
      <ReleaseNotice built={built} everyMs={EVERY} />
    </SettingsProviders>,
  );
}

describe("the reload notice", () => {
  it("stays quiet while the site runs the tab's own release", async () => {
    const fetch = siteAnswers("abc123");
    show("abc123");
    await wait(EVERY * 3);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch).toHaveBeenCalledWith("/release.json", { cache: "no-store" });
    expect(screen.queryByText(/new version/)).toBeNull();
  });

  it("offers a reload once a newer release is live, and then stops checking", async () => {
    const fetch = siteAnswers("abc123", "def456");
    show("abc123");
    await wait(EVERY);
    expect(screen.queryByText(/new version/)).toBeNull();
    await wait(EVERY);
    expect(screen.getByRole("status")).toHaveTextContent("A new version of the admin is ready. Save your work, then reload the page.");
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
    await wait(EVERY * 3);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("speaks Arabic in the Arabic admin", async () => {
    siteAnswers("def456");
    show("abc123", "ar");
    await wait(EVERY);
    expect(screen.getByRole("status")).toHaveTextContent("إصدار جديد من لوحة الإدارة جاهز.");
    expect(screen.getByRole("button", { name: "إعادة التحميل" })).toBeInTheDocument();
  });

  it("ignores a site that is restarting, failing or answering something else", async () => {
    const fetch = siteAnswers("down", 500, "broken", null, "abc123");
    show("abc123");
    await wait(EVERY * 5);
    expect(fetch).toHaveBeenCalledTimes(5);
    expect(screen.queryByText(/new version/)).toBeNull();
  });

  it("checks nothing in a development build, which has no release", async () => {
    const fetch = siteAnswers("def456");
    show(undefined);
    await wait(EVERY * 3);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("checks nothing while the tab is hidden, and checks at once when it comes back", async () => {
    const fetch = siteAnswers("def456");
    show("abc123");
    visibility = "hidden";
    await wait(EVERY * 3);
    expect(fetch).not.toHaveBeenCalled();
    visibility = "visible";
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
  });
});
