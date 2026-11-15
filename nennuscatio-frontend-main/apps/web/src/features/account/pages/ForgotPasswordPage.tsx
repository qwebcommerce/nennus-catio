"use client";

import { acceptedResponseSchema } from "@nennus-catio/contracts";
import { useMutation } from "@tanstack/react-query";
import type { FormEvent } from "react";
import { Link } from "@/i18n/navigation";
import { useRepositories } from "@/shared/api/DataSourceProvider";
import { errorMessage } from "@/shared/api/sessions";
import { useCopy } from "@/shared/lib/copy";
import { AuthCard, AuthField, formValue } from "../components/AuthForm";

/**
 * Shared by customers (`/api/auth`) and the owner (`/api/admin/auth`). The answer is the same
 * whether or not the email is registered.
 */
export function ForgotPasswordPage({ staff = false }: { staff?: boolean }) {
  const c = useCopy();
  const { api } = useRepositories();
  const request = useMutation({
    mutationFn: (email: string) =>
      api.post(staff ? "/admin/auth/forgot-password" : "/auth/forgot-password", { email, locale: c.locale }, acceptedResponseSchema),
  });
  const loginHref = staff ? "/admin/login" : "/account/login";

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    request.mutate(formValue(event.currentTarget, "email"));
  }

  return (
    <AuthCard
      title={c.text("Reset your password", "إعادة تعيين كلمة المرور")}
      intro={
        staff
          ? c.text(
              "Email reset links are for the owner. Other staff: please ask the owner for a new temporary password.",
              "روابط إعادة التعيين عبر البريد للمالك فقط. على باقي الموظفين طلب كلمة مرور مؤقتة جديدة من المالك.",
            )
          : c.text("We will email you a link to choose a new password.", "سنرسل إليك رابطاً لاختيار كلمة مرور جديدة.")
      }
    >
      {request.isSuccess ? (
        <div className="auth-success" role="status">
          <p>
            {c.text(
              "If an account uses this email, a reset link is on its way. It works for 1 hour.",
              "إذا كان هناك حساب بهذا البريد، فرابط إعادة التعيين في الطريق. صالح لمدة ساعة واحدة.",
            )}
          </p>
          <Link href={loginHref} className="text-link">
            {c.text("Back to log in", "العودة لتسجيل الدخول")}
          </Link>
        </div>
      ) : (
        <form className="form-stack" onSubmit={submit}>
          <AuthField label={c.text("Email", "البريد الإلكتروني")} name="email" type="email" autoComplete="email" maxLength={254} />
          {request.isError && (
            <p className="form-error" role="alert">
              {errorMessage(request.error, c.text)}
            </p>
          )}
          <button type="submit" className="button button--primary" disabled={request.isPending}>
            {c.text("Send reset link", "أرسل رابط إعادة التعيين")}
          </button>
        </form>
      )}
      <div className="auth-links">
        <Link href={loginHref}>{c.text("Back to log in", "العودة لتسجيل الدخول")}</Link>
      </div>
    </AuthCard>
  );
}
