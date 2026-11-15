import { getTranslations } from "next-intl/server";

export default async function Loading() {
  const t = await getTranslations("Common");
  return (
    <main className="boundary-page" aria-busy="true">
      <p role="status">{t("loading")}</p>
    </main>
  );
}
