"use client";

import { okResponseSchema, PASSWORD_MIN_LENGTH } from "@nennus-catio/contracts";
import { useMutation } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import type { FormEvent } from "react";
import { Link } from "@/i18n/navigation";
import { useRepositories } from "@/shared/api/DataSourceProvider";
import { errorMessage, fieldError } from "@/shared/api/sessions";
import { useCopy } from "@/shared/lib/copy";
import { AuthCard, AuthField, formValue } from "../components/AuthForm";

/** Opened from a reset email (customers, or the owner when `staff`). Every session is ended afterwards. */
export function ResetPasswordPage({ staff = false }: { staff?: boolean }) {
  const c = useCopy();
  const { api } = useRepositories();
  const token = useSearchParams().get("token") ?? "";
  const reset = useMutation({
    mutationFn: (password: string) =>
      api.post(staff ? "/admin/auth/reset-password" : "/auth/reset-password", { token, password }, okResponseSchema),
  });
  const loginHref = staff ? "/admin/login" : "/account/login";
  const forgotHref = staff ? "/admin/forgot-password" : "/account/forgot-password";

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    reset.mutate(formValue(event.currentTarget, "password"));
  }

  if (reset.isSuccess) {
    return (
      <AuthCard title={c.text("Password changed", "تم تغيير كلمة المرور")}>
        <div className="auth-success" role="status">
          <p>{c.text("All devices were logged out. Log in with your new password.", "تم تسجيل الخروج من جميع الأجهزة. سجّل الدخول بكلمة المرور الجديدة.")}</p>
          <Link href={loginHref} className="button button--primary">
            {c.text("Log in", "تسجيل الدخول")}
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={c.text("Choose a new password", "اختر كلمة مرور جديدة")}>
      {!token ? (
        <p className="form-error" role="alert">
          {c.text("The link is incomplete. Please open it from the email again.", "الرابط غير مكتمل. افتحه من الرسالة مرة أخرى.")}
        </p>
      ) : (
        <form className="form-stack" onSubmit={submit}>
          <AuthField
            label={c.text("New password", "كلمة المرور الجديدة")}
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={PASSWORD_MIN_LENGTH}
            maxLength={128}
            hint={c.text(`At least ${PASSWORD_MIN_LENGTH} characters.`, `${PASSWORD_MIN_LENGTH} أحرف على الأقل.`)}
            error={fieldError(reset.error, "password", c.text)}
          />
          {reset.isError && (
            <p className="form-error" role="alert">
              {errorMessage(reset.error, c.text)}
            </p>
          )}
          <button type="submit" className="button button--primary" disabled={reset.isPending}>
            {c.text("Save new password", "احفظ كلمة المرور")}
          </button>
        </form>
      )}
      <div className="auth-links">
        <Link href={forgotHref}>{c.text("Request a new link", "اطلب رابطاً جديداً")}</Link>
      </div>
    </AuthCard>
  );
}
