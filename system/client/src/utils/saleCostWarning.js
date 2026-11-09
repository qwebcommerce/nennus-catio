/**
 * تنبيه الكاشير: سعر بيع الوحدة أقل أو يساوي تكلفة الشراء المسجلة.
 */
export function isUnitPriceAtOrBelowCost(unitPrice, cost) {
  if (cost == null || cost === "") return false;
  const c = Number(cost);
  if (Number.isNaN(c) || c < 0) return false;
  const u = Number(unitPrice);
  if (Number.isNaN(u)) return false;
  return u <= c;
}
