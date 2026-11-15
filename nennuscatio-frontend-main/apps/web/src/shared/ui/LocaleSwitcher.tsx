"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname, Link } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";

export function LocaleSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const t = useTranslations("Common");
  const href = `${pathname}${search ? `?${search}` : ""}`;
  return (
    <nav className="locale-switch" aria-label={t("language")} dir="ltr">
      <Link
        href={href}
        locale="en"
        lang="en"
        aria-current={locale === "en" ? "true" : undefined}
      >
        EN
      </Link>
      <span aria-hidden="true">/</span>
      <Link
        href={href}
        locale="ar"
        lang="ar"
        aria-current={locale === "ar" ? "true" : undefined}
      >
        AR
      </Link>
    </nav>
  );
}
