import * as rootParams from "next/root-params";
import { notFound } from "next/navigation";
import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "./routing";

export default getRequestConfig(async ({ locale }) => {
  const selected = locale ?? (await rootParams.locale());
  if (!hasLocale(routing.locales, selected)) notFound();
  return {
    locale: selected,
    messages: (await import(`../messages/${selected}/common.json`)).default,
    timeZone: "Asia/Qatar",
  };
});
