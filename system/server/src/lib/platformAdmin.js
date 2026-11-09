/**
 * مدراء المنصة: بريدات مدرجة في PLATFORM_ADMIN_EMAILS (مفصولة بفواصل).
 * يجب أن يكون المستخدم ADMIN في مؤسسته لاستخدام /api/platform/*.
 */
export function parsePlatformAdminEmails() {
  const raw = process.env.PLATFORM_ADMIN_EMAILS || "";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isPlatformAdminEmail(email) {
  if (!email) return false;
  const list = parsePlatformAdminEmails();
  if (list.length === 0) return false;
  return list.includes(String(email).toLowerCase().trim());
}
