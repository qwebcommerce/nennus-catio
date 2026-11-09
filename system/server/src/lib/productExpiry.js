/** فرق الأيام بين «اليوم» وتاريخ انتهاء الصلاحية (تقويم UTC للتاريخ فقط) */
export function calendarDaysUntilExpiryUTC(expiryDate) {
  const e = new Date(expiryDate);
  if (Number.isNaN(e.getTime())) return null;
  const t = new Date();
  const utcE = Date.UTC(e.getUTCFullYear(), e.getUTCMonth(), e.getUTCDate());
  const utcT = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
  return Math.round((utcE - utcT) / 86400000);
}
