/**
 * عزل منطقي: كل طلب مصادق يحمل organizationId من JWT (بعد تسجيل الدخول).
 */

/** معرف المؤسسة للمستخدم الحالي — يجب أن يكون موجوداً بعد authMiddleware */
export function orgId(req) {
  return req.user?.organizationId ?? null;
}

export function requireOrgId(req, res) {
  const id = orgId(req);
  if (!id) {
    res.status(401).json({ error: "انتهت الجلسة — سجّل الدخول مجدداً" });
    return null;
  }
  return id;
}

/** شرط فرع ضمن المؤسسة */
export function branchInOrg(organizationId, branchId) {
  return { id: branchId, organizationId };
}

/**
 * يتحقق أن الفرع تابع للمؤسسة. يعيد { id } أو null.
 */
export async function findBranchInOrg(prisma, organizationId, branchId) {
  if (!branchId) return null;
  return prisma.branch.findFirst({
    where: { id: String(branchId), organizationId },
    select: { id: true },
  });
}

/** فلتر مبيعات/مخزون عبر الفروع التابعة للمؤسسة */
export function saleScope(organizationId, extra = {}) {
  return {
    ...extra,
    branch: { organizationId },
  };
}
