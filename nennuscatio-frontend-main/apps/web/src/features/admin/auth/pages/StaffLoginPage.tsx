"use client";

import { staffProfileSchema } from "@nennus-catio/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import type { FormEvent } from "react";
import { AuthField, formValue } from "@/features/account/components/AuthForm";
import { Link, useRouter } from "@/i18n/navigation";
import { useRepositories } from "@/shared/api/DataSourceProvider";
import { errorMessage, staffSessionKey } from "@/shared/api/sessions";
import { useCopy } from "@/shared/lib/copy";
import { Brand } from "@/shared/ui/Brand";

/** Only admin paths are accepted as a return address (no open redirect). */
export function safeNext(value: string | null): string {
  return value && /^\/admin(\/[a-z-]+)*$/.test(value) && value !== "/admin/login" ? value : "/admin";
}

export function StaffLoginPage() {
  const c = useCopy();
  const { api } = useRepositories();
  const router = useRouter();
  const queryClient = useQueryClient();
  const next = safeNext(useSearchParams().get("next"));
  const login = useMutation({
    mutationFn: (body: { email: string; password: string }) =>
      api.post("/admin/auth/login", body, staffProfileSchema),
    onSuccess: (staff) => {
      queryClient.setQueryData(staffSessionKey, staff);
      router.replace(staff.mustChangePassword ? "/admin/change-password" : next);
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    login.mutate({ email: formValue(form, "email"), password: formValue(form, "password") });
  }

  return (
    <div className="auth-page auth-page--staff">
      <section className="auth-card" aria-labelledby="staff-login-title">
        <Brand compact />
        <h1 id="staff-login-title">{c.text("Staff log in", "دخول الموظفين")}</h1>
        <p className="muted">
          {c.text(
            "Staff accounts are created by the owner. Use the email and password they gave you.",
            "ينشئ المالك حسابات الموظفين. استخدم البريد وكلمة المرور التي أعطاك إياها.",
          )}
        </p>
        <form className="form-stack" onSubmit={submit}>
          <AuthField label={c.text("Email", "البريد الإلكتروني")} name="email" type="email" autoComplete="username" maxLength={254} />
          <AuthField
            label={c.text("Password", "كلمة المرور")}
            name="password"
            type="password"
            autoComplete="current-password"
            maxLength={128}
          />
          {login.isError && (
            <p className="form-error" role="alert">
              {errorMessage(login.error, c.text)}
            </p>
          )}
          <button type="submit" className="button button--primary" disabled={login.isPending}>
            {login.isPending ? c.text("Logging in…", "جارٍ تسجيل الدخول…") : c.text("Log in", "تسجيل الدخول")}
          </button>
        </form>
        <div className="auth-links">
          <Link href="/admin/forgot-password">{c.text("Forgot your password?", "نسيت كلمة المرور؟")}</Link>
          <Link href="/">{c.text("Back to the website", "العودة إلى الموقع")}</Link>
        </div>
      </section>
    </div>
  );
}
