import { prisma } from "../lib/prisma.js";
import { isPlatformAdminEmail } from "../lib/platformAdmin.js";

/**
 * بعد authMiddleware — يتحقق أن المستخدم ADMIN وبريده ضمن PLATFORM_ADMIN_EMAILS.
 */
export async function requirePlatformAdmin(req, res, next) {
  try {
    if (!req.user?.sub || !req.user?.organizationId) {
      return res.status(401).json({ error: "يجب تسجيل الدخول" });
    }
    const u = await prisma.user.findFirst({
      where: { id: req.user.sub, organizationId: req.user.organizationId },
      select: { id: true, email: true, role: true },
    });
    if (!u || u.role !== "ADMIN") {
      return res.status(403).json({ error: "صلاحية غير كافية" });
    }
    if (!isPlatformAdminEmail(u.email)) {
      return res.status(403).json({ error: "وصول لوحة المنصة غير مفعّل لهذا الحساب" });
    }
    req.platformAdmin = { id: u.id, email: u.email };
    next();
  } catch (e) {
    next(e);
  }
}
