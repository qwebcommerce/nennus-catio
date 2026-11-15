import { getTranslations } from "next-intl/server";
import { ActionLink } from "@/shared/ui/ActionLink";

export default async function NotFound() {
  const t = await getTranslations("Common");
  return (
    <main className="boundary-page">
      <h1>{t("notFound")}</h1>
      <p>{t("notFoundDetail")}</p>
      <ActionLink href="/">{t("backHome")}</ActionLink>
    </main>
  );
}
