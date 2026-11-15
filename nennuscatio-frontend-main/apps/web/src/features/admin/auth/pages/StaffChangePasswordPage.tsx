"use client";

import { PASSWORD_MIN_LENGTH, staffProfileSchema } from "@nennus-catio/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect } from "react";
import { AuthField, formValue } from "@/features/account/components/AuthForm";
import { useRouter } from "@/i18n/navigation";
import { ApiError } from "@/shared/api/client";
import { useRepositories } from "@/shared/api/DataSourceProvider";
import { errorMessage, fieldError, staffSessionKey, useStaffSession } from "@/shared/api/sessions";
import { useCopy } from "@/shared/lib/copy";
import { Brand } from "@/shared/ui/Brand";
import { useStaffLogout } from "../StaffGate";

/** First login with a temporary password, or a voluntary change. Ends the staff member's other sessions. */
export function StaffChangePasswordPage() {
  const c = useCopy();
  const { api } = useRepositories();
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useStaffSession();
  const logout = useStaffLogout();
  const change = useMutation({
    mutationFn: (body: { currentPassword: string; newPassword: string }) =>
      api.post("/admin/auth/change-password", body, staffProfileSchema),
    onSuccess: (staff) => {
      queryClient.setQueryData(staffSessionKey, staff);
      router.replace("/admin");
    },
  });

  useEffect(() => {
    if (!session.isPending && !session.isError && !session.data) router.replace("/admin/login");
  }, [session.isPending, session.isError, session.data, router]);

  const temporary = session.data?.mustChangePassword ?? false;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    change.mutate({
      currentPassword: formValue(form, "currentPassword"),
      newPassword: formValue(form, "newPassword"),
    });
  }

  return (
    <div className="auth-page auth-page--staff">
      <section className="auth-card" aria-labelledby="change-title">
        <Brand compact />
        <h1 id="change-title">{c.text("Choose your password", "اختر كلمة مرورك")}</h1>
        <p className="muted">
          {temporary
            ? c.text(
                "You are using a temporary password from the owner. Choose your own before continuing; only you will know it.",
                "تستخدم كلمة مرور مؤقتة من المالك. اختر كلمة مرورك الخاصة قبل المتابعة؛ لن يعرفها أحد غيرك.",
              )
            : c.text("Your other devices will be logged out.", "سيتم تسجيل الخروج من أجهزتك الأخرى.")}
        </p>
        <form className="form-stack" onSubmit={submit}>
          {/* Lets password managers save the new password for the right account. */}
          <input type="hidden" name="username" autoComplete="username" value={session.data?.email ?? ""} />
          <AuthField
            label={temporary ? c.text("Temporary password", "كلمة المرور المؤقتة") : c.text("Current password", "كلمة المرور الحالية")}
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            maxLength={128}
            error={change.error instanceof ApiError && change.error.code === "INVALID_CREDENTIALS"
              ? c.text("This password is incorrect.", "كلمة المرور هذه غير صحيحة.")
              : undefined}
          />
          <AuthField
            label={c.text("New password", "كلمة المرور الجديدة")}
            name="newPassword"
            type="password"
            autoComplete="new-password"
            minLength={PASSWORD_MIN_LENGTH}
            maxLength={128}
            hint={c.text(`At least ${PASSWORD_MIN_LENGTH} characters.`, `${PASSWORD_MIN_LENGTH} أحرف على الأقل.`)}
            error={fieldError(change.error, "newPassword", c.text)}
          />
          {change.isError && (
            <p className="form-error" role="alert">
              {errorMessage(change.error, c.text)}
            </p>
          )}
          <button type="submit" className="button button--primary" disabled={change.isPending || session.isPending}>
            {c.text("Save password", "احفظ كلمة المرور")}
          </button>
        </form>
        <div className="auth-links">
          <button type="button" className="text-button" onClick={() => logout.mutate()}>
            {c.text("Log out", "تسجيل الخروج")}
          </button>
        </div>
      </section>
    </div>
  );
}
