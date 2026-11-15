"use client";

import type { CatalogStatus } from "@/shared/api/catalog";
import { useCopy } from "@/shared/lib/copy";
import { Button } from "./Button";

/** Shown instead of product results while the catalogue loads or after it failed to load. */
export function CatalogState({ status, retry }: { status: Exclude<CatalogStatus, "ready">; retry: () => void }) {
  const c = useCopy();
  if (status === "loading") {
    return (
      <p className="muted catalog-state" role="status" aria-busy="true">
        {c.text("Loading products…", "جارٍ تحميل المنتجات…")}
      </p>
    );
  }
  return (
    <div className="inline-state catalog-state" role="alert">
      <p>{c.text("Products could not be loaded.", "تعذّر تحميل المنتجات.")}</p>
      <Button variant="secondary" onClick={retry}>
        {c.text("Retry", "أعد المحاولة")}
      </Button>
    </div>
  );
}
