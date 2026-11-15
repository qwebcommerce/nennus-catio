export function houseModelCount(count: number, locale: "en" | "ar") {
  if (locale === "en") return `${count} ${count === 1 ? "model" : "models"}`;
  if (count === 0) return "لا توجد تصاميم";
  if (count === 1) return "تصميم واحد";
  if (count === 2) return "تصميمان";
  const number = new Intl.NumberFormat("ar-QA").format(count);
  const plural = new Intl.PluralRules("ar").select(count);
  return `${number} ${plural === "few" ? "تصاميم" : plural === "many" ? "تصميماً" : "تصميم"}`;
}
