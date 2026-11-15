import type { Metadata } from "next";
import type { ReactNode } from "react";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { GlobalProviders } from "@/layouts/global/GlobalProviders";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/playfair-display/600.css";
import "@fontsource/playfair-display/700.css";
import "@fontsource/noto-sans-arabic/400.css";
import "@fontsource/noto-sans-arabic/600.css";
import "@fontsource/noto-sans-arabic/700.css";
import "@/styles/globals.css";
import "@/styles/reference-refresh.css";
import "@/styles/finance-reference.css";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: {
      default: "Nennus Catio · Design Preview",
      template: "%s · Nennus Catio",
    },
    description:
      locale === "ar"
        ? "معاينة تصميم المتجر والعناية في قطر"
        : "Shop and grooming design preview for Qatar",
    robots: { index: false, follow: false },
  };
}
export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const messages = await getMessages();
  return (
    <html lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
      <body>
        <NextIntlClientProvider
          locale={locale}
          messages={messages}
          timeZone="Asia/Qatar"
        >
          <GlobalProviders>
            {children}
            <div
              id="status-announcements"
              className="sr-only"
              role="status"
              aria-live="polite"
            />
          </GlobalProviders>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
