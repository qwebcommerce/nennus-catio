import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import {
  dbUnavailableMessage,
  isDbUnavailableError,
} from "../lib/dbErrors.js";
import { databaseUrlFingerprint } from "../lib/databaseUrlFingerprint.js";
import {
  signToken,
  authMiddleware,
  setSessionCookie,
  clearSessionCookie,
  STAFF_COOKIE,
  STAFF_SESSION_MS,
} from "../middleware/auth.js";
import { buildSessionUser } from "../lib/sessionUser.js";

const router = Router();

router.post("/login", async (req, res, next) => {
  try {
    const { email, password, organizationSlug } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "البريد وكلمة المرور مطلوبان" });
    }
    const emailNorm = String(email).toLowerCase().trim();
    const slug =
      organizationSlug != null && String(organizationSlug).trim()
        ? String(organizationSlug).trim()
        : null;

    let user;
    if (slug) {
      user = await prisma.user.findFirst({
        where: {
          email: emailNorm,
          organization: { slug },
        },
        include: { branch: true, organization: true },
        omit: { passwordHash: false },
      });
    } else {
      const matches = await prisma.user.findMany({
        where: { email: emailNorm },
        include: { branch: true, organization: true },
        omit: { passwordHash: false },
        take: 5,
      });
      if (matches.length > 1) {
        return res.status(400).json({
          error: "هذا البريد مسجّل في أكثر من مؤسسة — أدخل رمز المؤسسة (slug)",
        });
      }
      user = matches[0] || null;
    }

    const passwordOk =
      user && (await bcrypt.compare(String(password), user.passwordHash));
    if (!user || !passwordOk) {
      return res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
    }
    if (!user.active) {
      return res.status(403).json({
        error: "هذا الحساب معطّل — تواصل مع مالك المؤسسة",
        errorAr: "هذا الحساب معطّل — تواصل مع مالك المؤسسة",
        errorEn: "This account is deactivated — contact the owner",
        code: "USER_DEACTIVATED",
      });
    }
    const token = signToken({
      sub: user.id,
      typ: "staff",
      organizationId: user.organizationId,
      sv: user.sessionVersion,
    });
    // NFR-11: the session lives in an httpOnly cookie; the token is not returned to page scripts.
    setSessionCookie(res, STAFF_COOKIE, token, STAFF_SESSION_MS);
    const sessionUser = await buildSessionUser(prisma, user, user.organization, user.branch);
    res.json({ user: sessionUser });
  } catch (e) {
    if (isDbUnavailableError(e)) {
      console.error("[auth/login] database:", e.message);
      return res.status(503).json({ error: dbUnavailableMessage, urlInfo: databaseUrlFingerprint() });
    }
    next(e);
  }
});

router.post("/logout", (_req, res) => {
  clearSessionCookie(res, STAFF_COOKIE);
  res.json({ ok: true });
});

router.get("/me", authMiddleware, async (req, res, next) => {
  try {
    const user = await prisma.user.findFirst({
      where: { id: req.user.sub, organizationId: req.user.organizationId },
      include: { branch: true, organization: true },
    });
    if (!user) return res.status(404).json({ error: "المستخدم غير موجود" });
    res.json(await buildSessionUser(prisma, user, user.organization, user.branch));
  } catch (e) {
    next(e);
  }
});

export default router;
