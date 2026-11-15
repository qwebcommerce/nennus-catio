"use client";
import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useCopy } from "@/shared/lib/copy";

/** Inlined at build time by `deploy/release.sh`; none in development, where the notice stays off. */
const BUILT_RELEASE = process.env.NEXT_PUBLIC_RELEASE || undefined;
const CHECK_EVERY_MS = 2 * 60_000;

/** What `/release.json` answers: the running release, or none. Anything else counts as no answer. */
function runningRelease(body: unknown): string | null {
  if (typeof body !== "object" || body === null || !("release" in body)) return null;
  return typeof body.release === "string" && body.release !== "" ? body.release : null;
}

/**
 * "A new version is ready" for open admin tabs (13b). After a deploy, a tab still runs the old code,
 * and its next page may fail to load. The tab checks the running release every two minutes while it
 * is visible, and whenever it comes back into view; it never reloads by itself, so a half-filled form
 * is never lost.
 */
export function ReleaseNotice({ built = BUILT_RELEASE, everyMs = CHECK_EVERY_MS }: { built?: string; everyMs?: number }) {
  const c = useCopy();
  const [newer, setNewer] = useState(false);

  useEffect(() => {
    if (!built || newer) return;
    let stopped = false;
    async function check() {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch("/release.json", { cache: "no-store" });
        if (!response.ok) return;
        const running = runningRelease(await response.json());
        if (!stopped && running !== null && running !== built) setNewer(true);
      } catch {
        // The site restarting, or the tab offline: the next check tries again.
      }
    }
    const timer = window.setInterval(check, everyMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [built, everyMs, newer]);

  return (
    <div role="status" className="release-notice-region">
      {newer && (
        <div className="note-box release-notice">
          <RefreshCw size={16} aria-hidden="true" />
          <p>
            <strong>{c.text("A new version of the admin is ready.", "إصدار جديد من لوحة الإدارة جاهز.")}</strong>{" "}
            {c.text("Save your work, then reload the page.", "احفظ عملك، ثم أعد تحميل الصفحة.")}
          </p>
          <button type="button" className="button button--secondary" onClick={() => window.location.reload()}>
            {c.text("Reload", "إعادة التحميل")}
          </button>
        </div>
      )}
    </div>
  );
}
