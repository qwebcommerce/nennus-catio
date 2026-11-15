"use client";

import { acceptedResponseSchema, customerProfileSchema } from "@nennus-catio/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { ApiError } from "@/shared/api/client";
import { useRepositories } from "@/shared/api/DataSourceProvider";
import { customerSessionKey, errorMessage } from "@/shared/api/sessions";
import { useCopy } from "@/shared/lib/copy";
import { safeCustomerNext } from "@/shared/lib/customer-login";
import { AuthCard, AuthField, formValue } from "../components/AuthForm";

export function LoginPage() {
  const c = useCopy();
  const { api } = useRepositories();
  const router = useRouter();
  const queryClient = useQueryClient();
  // Back to the order, My orders or checkout the customer came from; otherwise My account (M8).
  const next = safeCustomerNext(useSearchParams().get("next"));
  const [email, setEmail] = useState("");
  const login = useMutation({
    mutationFn: (body: { email: string; password: string }) =>
      api.post("/auth/login", body, customerProfileSchema),
    onSuccess: (profile) => {
      queryClient.setQueryData(customerSessionKey, profile);
      router.replace(next);
    },
  });
  const resend = useMutation({
    mutationFn: () =>
      api.post("/auth/resend-verification", { email, locale: c.locale }, acceptedResponseSchema),
  });
  const notVerified = login.error instanceof ApiError && login.error.code === "EMAIL_NOT_VERIFIED";

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resend.reset();
    login.mutate({ email, password: formValue(event.currentTarget, "password") });
  }

  return (
    <AuthCard title={c.text("Log in", "تسجيل الدخول")}>
      <form className="form-stack" onSubmit={submit}>
        <AuthField
          label={c.text("Email", "البريد الإلكتروني")}
          name="email"
          type="email"
          autoComplete="email"
          maxLength={254}
          value={email}
          onChange={setEmail}
        />
        <AuthField
          label={c.text("Password", "كلمة المرور")}
          name="password"
          type="password"
          autoComplete="current-password"
          maxLength={128}
        />
        {login.isError && (
          <div className="form-error" role="alert">
            <p>{errorMessage(login.error, c.text)}</p>
            {notVerified &&
              (resend.isSuccess ? (
                <p>{c.text("If the account is waiting for confirmation, a new link is on its way.", "إذا كان الحساب بانتظار التأكيد، فرابط جديد في الطريق.")}</p>
              ) : (
                <button type="button" className="text-button" onClick={() => resend.mutate()} disabled={resend.isPending}>
                  {c.text("Send the confirmation link again", "أرسل رابط التأكيد مرة أخرى")}
                </button>
              ))}
          </div>
        )}
        <button type="submit" className="button button--primary" disabled={login.isPending}>
          {login.isPending ? c.text("Logging in…", "جارٍ تسجيل الدخول…") : c.text("Log in", "تسجيل الدخول")}
        </button>
      </form>
      <div className="auth-links">
        <Link href="/account/forgot-password">{c.text("Forgot your password?", "نسيت كلمة المرور؟")}</Link>
        <Link href="/account/register">{c.text("Create an account", "أنشئ حساباً")}</Link>
      </div>
    </AuthCard>
  );
}
