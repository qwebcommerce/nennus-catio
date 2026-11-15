"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/shared/ui/Button";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("Common");
  return (
    <main className="boundary-page">
      <h1>{t("error")}</h1>
      <p>{t("errorDetail")}</p>
      <Button onClick={reset}>{t("retry")}</Button>
    </main>
  );
}
