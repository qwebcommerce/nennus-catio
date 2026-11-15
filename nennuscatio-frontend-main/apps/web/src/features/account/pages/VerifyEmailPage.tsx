"use client";

import { okResponseSchema } from "@nennus-catio/contracts";
import { useMutation } from "@tanstack/react-query";
import { CircleCheck } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { Link } from "@/i18n/navigation";
import { useRepositories } from "@/shared/api/DataSourceProvider";
import { errorMessage } from "@/shared/api/sessions";
import { useCopy } from "@/shared/lib/copy";
import { AuthCard } from "../components/AuthForm";

/** Opened from the confirmation email. The token is sent once; the page never shows it. */
export function VerifyEmailPage() {
  const c = useCopy();
  const { api } = useRepositories();
  const token = useSearchParams().get("token") ?? "";
  const verify = useMutation({
    mutationFn: (value: string) => api.post("/auth/verify-email", { token: value }, okResponseSchema),
  });
  const started = useRef(false);
  useEffect(() => {
    // Strict-mode double effects must not spend the single-use token twice.
    if (started.current || !token) return;
    started.current = true;
    verify.mutate(token);
  }, [token, verify]);

  if (verify.isSuccess) {
    return (
      <AuthCard title={c.text("Email confirmed", "تم تأكيد البريد")}>
        <div className="auth-success" role="status">
          <CircleCheck size={30} aria-hidden="true" />
          <p>{c.text("Your account is ready. You can log in now.", "حسابك جاهز. يمكنك تسجيل الدخول الآن.")}</p>
          <Link href="/account/login" className="button button--primary">
            {c.text("Log in", "تسجيل الدخول")}
          </Link>
        </div>
      </AuthCard>
    );
  }
  if (!token || verify.isError) {
    return (
      <AuthCard title={c.text("This link did not work", "لم يعمل هذا الرابط")}>
        <p className="form-error" role="alert">
          {token
            ? errorMessage(verify.error, c.text)
            : c.text("The link is incomplete. Please open it from the email again.", "الرابط غير مكتمل. افتحه من الرسالة مرة أخرى.")}
        </p>
        <div className="auth-links">
          <Link href="/account/login">
            {c.text("Log in to get a new confirmation link", "سجّل الدخول للحصول على رابط تأكيد جديد")}
          </Link>
        </div>
      </AuthCard>
    );
  }
  return (
    <AuthCard title={c.text("Confirming your email…", "جارٍ تأكيد بريدك…")}>
      <p role="status" aria-busy="true" className="muted">
        {c.text("One moment.", "لحظة واحدة.")}
      </p>
    </AuthCard>
  );
}
