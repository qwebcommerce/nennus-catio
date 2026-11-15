"use client";

import { okResponseSchema } from "@nennus-catio/contracts";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { AuthField, formValue } from "@/features/account/components/AuthForm";
import { ApiError } from "@/shared/api/client";
import { useRepositories } from "@/shared/api/DataSourceProvider";
import { errorMessage } from "@/shared/api/sessions";
import { useCopy } from "@/shared/lib/copy";
import { Modal } from "@/shared/ui/BusinessUI";

type PendingAction = () => Promise<unknown>;

/**
 * Sensitive owner actions need the password re-entered within 10 minutes (D98): Team & Access, and
 * the Integrations page's keys (#16 part 2c). When the API answers REAUTH_REQUIRED, the action is
 * kept, the password is asked for, and the action re-runs.
 */
export function useReauthentication() {
  const { api } = useRepositories();
  const [pending, setPending] = useState<PendingAction | null>(null);
  const reauth = useMutation({
    mutationFn: (password: string) => api.post("/admin/auth/reauthenticate", { password }, okResponseSchema),
  });
  async function run<T>(action: () => Promise<T>): Promise<T | undefined> {
    try {
      return await action();
    } catch (error: unknown) {
      if (error instanceof ApiError && error.code === "REAUTH_REQUIRED") {
        reauth.reset();
        setPending(() => action);
        return undefined;
      }
      throw error;
    }
  }
  async function confirm(password: string): Promise<void> {
    await reauth.mutateAsync(password);
    const action = pending;
    setPending(null);
    await action?.();
  }
  return { run, confirm, pending: pending !== null, cancel: () => setPending(null), reauth };
}

/** The password, asked again; `description` says what it unlocks. */
export function ReauthModal({
  open,
  onCancel,
  onConfirm,
  error,
  pending,
  description,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: (password: string) => void;
  error: unknown;
  pending: boolean;
  description: string;
}) {
  const c = useCopy();
  return (
    <Modal open={open} onOpenChange={(value) => !value && onCancel()} title={c.text("Confirm it's you", "أكّد هويتك")} description={description}>
      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault();
          onConfirm(formValue(event.currentTarget, "password"));
        }}
      >
        <AuthField label={c.text("Your password", "كلمة مرورك")} name="password" type="password" autoComplete="current-password" maxLength={128} />
        {error !== null && (
          <p className="form-error" role="alert">
            {error instanceof ApiError && error.code === "INVALID_CREDENTIALS"
              ? c.text("The password is incorrect.", "كلمة المرور غير صحيحة.")
              : errorMessage(error, c.text)}
          </p>
        )}
        <button type="submit" className="button button--primary" disabled={pending}>
          {c.text("Confirm", "تأكيد")}
        </button>
      </form>
    </Modal>
  );
}
