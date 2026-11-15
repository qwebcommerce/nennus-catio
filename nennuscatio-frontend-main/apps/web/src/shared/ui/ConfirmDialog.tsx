"use client";

import { useState } from "react";
import { useCopy } from "@/shared/lib/copy";
import { Modal } from "./BusinessUI";

/** What to ask, and what to do once the user confirms. `run` reports its own errors. */
export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel: string;
  run: () => Promise<void> | void;
}

/**
 * "Are you sure?" before every delete and risky change in the admin (D128). Nothing is sent until
 * the user presses the confirm button; Cancel, Escape or closing the dialog sends nothing.
 *
 * Usage: keep a `ConfirmRequest | null` in state, set it from the action button, and render
 * `<ConfirmDialog request={request} onClose={() => setRequest(null)} />`.
 */
export function ConfirmDialog({ request, onClose }: { request: ConfirmRequest | null; onClose: () => void }) {
  const c = useCopy();
  const [pending, setPending] = useState(false);

  async function confirm() {
    if (!request || pending) return;
    setPending(true);
    try {
      await request.run();
    } finally {
      setPending(false);
      onClose();
    }
  }

  return (
    <Modal
      open={request !== null}
      onOpenChange={(open) => !open && !pending && onClose()}
      title={request?.title ?? ""}
      description={request?.message ?? ""}
    >
      <div className="row confirm-actions">
        <button type="button" className="button button--secondary" disabled={pending} onClick={onClose}>
          {c.text("Cancel", "إلغاء")}
        </button>
        <button type="button" className="button button--danger" disabled={pending} onClick={() => void confirm()}>
          {request?.confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
