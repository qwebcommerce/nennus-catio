"use client";

import { acceptedResponseSchema, PASSWORD_MIN_LENGTH } from "@nennus-catio/contracts";
import { useMutation } from "@tanstack/react-query";
import { MailCheck } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useRepositories } from "@/shared/api/DataSourceProvider";
import { errorMessage, fieldError } from "@/shared/api/sessions";
import { useCopy } from "@/shared/lib/copy";
import { AuthCard, AuthField, formValue } from "../components/AuthForm";

/** Customer self-registration with any email address, Gmail included (D74/D96). */
export function RegisterPage() {
  const c = useCopy();
  const { api } = useRepositories();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const register = useMutation({
    mutationFn: (body: { email: string; password: string }) =>
      api.post("/auth/register", { ...body, locale: c.locale }, acceptedResponseSchema),
    onSuccess: (_data, body) => setSentTo(body.email.trim()),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    register.mutate({ email: formValue(form, "email"), password: formValue(form, "password") });
  }

  if (sentTo) {
    return (
      <AuthCard title={c.text("Check your inbox", "تحقق من بريدك")}>
        <div className="auth-success" role="status">
          <MailCheck size={30} aria-hidden="true" />
          <p>
            {c.text("We sent a confirmation link to", "أرسلنا رابط التأكيد إلى")} <bdi dir="ltr">{sentTo}</bdi>.{" "}
            {c.text(
              "Open it within 48 hours to finish creating your account. If you already have an account, the email explains how to log in.",
              "افتحه خلال 48 ساعة لإكمال إنشاء حسابك. إذا كان لديك حساب بالفعل، ستوضح الرسالة طريقة تسجيل الدخول.",
            )}
          </p>
          <Link href="/account/login" className="text-link">
            {c.text("Go to log in", "انتقل إلى تسجيل الدخول")}
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={c.text("Create your account", "أنشئ حسابك")}
      intro={c.text(
        "Use any email address, Gmail included. You can still check out as a guest.",
        "استخدم أي بريد إلكتروني، بما في ذلك Gmail. يمكنك أيضاً إتمام الطلب كضيف.",
      )}
    >
      <form className="form-stack" onSubmit={submit} noValidate={false}>
        <AuthField
          label={c.text("Email", "البريد الإلكتروني")}
          name="email"
          type="email"
          autoComplete="email"
          maxLength={254}
          error={fieldError(register.error, "email", c.text)}
        />
        <AuthField
          label={c.text("Password", "كلمة المرور")}
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
          maxLength={128}
          hint={c.text(
            `At least ${PASSWORD_MIN_LENGTH} characters. A short sentence is easy to remember.`,
            `${PASSWORD_MIN_LENGTH} أحرف على الأقل. جملة قصيرة يسهل تذكرها.`,
          )}
          error={fieldError(register.error, "password", c.text)}
        />
        {register.isError && (
          <p className="form-error" role="alert">
            {errorMessage(register.error, c.text)}
          </p>
        )}
        <button type="submit" className="button button--primary" disabled={register.isPending}>
          {register.isPending ? c.text("Creating…", "جارٍ الإنشاء…") : c.text("Create account", "أنشئ الحساب")}
        </button>
      </form>
      <div className="auth-links">
        <Link href="/account/login">{c.text("I already have an account", "لدي حساب بالفعل")}</Link>
      </div>
    </AuthCard>
  );
}
