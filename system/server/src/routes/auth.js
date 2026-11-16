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
import crypto from "crypto";
import { writeAudit } from "../lib/auditLog.js";
import { enqueueMail, mailConfigured } from "../lib/mailer.js";
import { publicBase } from "../lib/publicUrl.js";

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

const RESET_TTL_MS = 60 * 60 * 1000;
const MIN_STAFF_PASSWORD = 8;
const sha256 = (v) => crypto.createHash("sha256").update(v).digest("hex");
const fail = (res, status, errorAr, errorEn, code) =>
  res.status(status).json({ error: errorAr, errorAr, errorEn, ...(code ? { code } : {}) });

/**
 * Staff "forgot password". Always answers ok so the endpoint does not reveal which emails exist.
 * Every active staff account with that email gets its own one-hour link.
 */
router.post("/forgot-password", async (req, res, next) => {
  try {
    const email = String(req.body?.email || "").toLowerCase().trim();
    if (!email) return fail(res, 400, "البريد مطلوب", "Email is required");
    const users = await prisma.user.findMany({
      where: { email, active: true },
      include: { organization: { select: { name: true } } },
      take: 5,
    });
    let devLink = null;
    for (const user of users) {
      const token = crypto.randomBytes(32).toString("hex");
      await prisma.user.update({
        where: { id: user.id },
        data: { resetTokenHash: sha256(token), resetExpiresAt: new Date(Date.now() + RESET_TTL_MS) },
      });
      const link = `${publicBase(req)}/reset-password?token=${encodeURIComponent(token)}`;
      devLink = link;
      await enqueueMail({
        to: user.email,
        organizationId: user.organizationId,
        kind: "staff_reset",
        subject: "إعادة تعيين كلمة المرور / Reset your password",
        text:
          `مرحباً ${user.name}،\nلإعادة تعيين كلمة مرور حسابك في ${user.organization?.name || "Nennus Catio"} افتح الرابط التالي خلال ساعة:\n${link}\n\n` +
          `Hello ${user.nameEn || user.name},\nTo reset the password of your ${user.organization?.name || "Nennus Catio"} staff account, open this link within one hour:\n${link}\n\n` +
          "إذا لم تطلب ذلك فتجاهل هذه الرسالة. / If you did not ask for this, ignore this email.",
      });
    }
    res.json({
      ok: true,
      ...(devLink && !mailConfigured() && process.env.NODE_ENV !== "production" ? { resetLink: devLink } : {}),
    });
  } catch (e) {
    next(e);
  }
});

/** Staff reset from the emailed link. Ends every older session. */
router.post("/reset-password", async (req, res, next) => {
  try {
    const token = String(req.body?.token || "").trim();
    const password = String(req.body?.password || "");
    if (password.length < MIN_STAFF_PASSWORD) {
      return fail(res, 400, "كلمة المرور يجب أن تكون 8 أحرف على الأقل", "Use a password of at least 8 characters");
    }
    const invalid = () => fail(res, 400, "رابط إعادة التعيين غير صالح أو منتهي", "This reset link is not valid or has expired", "RESET_INVALID");
    if (!token) return invalid();
    const user = await prisma.user.findUnique({ where: { resetTokenHash: sha256(token) } });
    if (!user || !user.active || !user.resetExpiresAt || user.resetExpiresAt < new Date()) return invalid();
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.$transaction(async (tx) => {
      // Guarded on the token so a link can be used once even if submitted twice.
      const done = await tx.user.updateMany({
        where: { id: user.id, resetTokenHash: sha256(token) },
        data: { passwordHash, resetTokenHash: null, resetExpiresAt: null, sessionVersion: { increment: 1 } },
      });
      if (done.count !== 1) throw Object.assign(new Error("reset used"), { status: 400, errorAr: "رابط إعادة التعيين غير صالح أو منتهي", errorEn: "This reset link is not valid or has expired", code: "RESET_INVALID" });
      await writeAudit(
        { userId: user.id, action: "STAFF_PASSWORD_RESET", entityType: "User", entityId: user.id, summary: "Password reset from emailed link" },
        tx
      );
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

/** Signed-in staff change their own password. Other sessions end; this one gets a fresh cookie. */
router.post("/change-password", authMiddleware, async (req, res, next) => {
  try {
    const currentPassword = String(req.body?.currentPassword || "");
    const newPassword = String(req.body?.newPassword || "");
    if (newPassword.length < MIN_STAFF_PASSWORD) {
      return fail(res, 400, "كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل", "Use a new password of at least 8 characters");
    }
    const user = await prisma.user.findUnique({ where: { id: req.user.sub }, omit: { passwordHash: false } });
    if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
      return fail(res, 400, "كلمة المرور الحالية غير صحيحة", "The current password is not correct", "WRONG_PASSWORD");
    }
    if (await bcrypt.compare(newPassword, user.passwordHash)) {
      return fail(res, 400, "اختر كلمة مرور مختلفة عن الحالية", "Choose a password different from the current one");
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.user.update({
        where: { id: user.id },
        data: { passwordHash, resetTokenHash: null, resetExpiresAt: null, sessionVersion: { increment: 1 } },
        select: { id: true, organizationId: true, sessionVersion: true },
      });
      await writeAudit(
        { userId: user.id, action: "STAFF_PASSWORD_CHANGE", entityType: "User", entityId: user.id, summary: "Changed own password" },
        tx
      );
      return row;
    });
    const token = signToken({ sub: updated.id, typ: "staff", organizationId: updated.organizationId, sv: updated.sessionVersion });
    setSessionCookie(res, STAFF_COOKIE, token, STAFF_SESSION_MS);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export default router;
