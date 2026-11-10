import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import {
  dbUnavailableMessage,
  isDbUnavailableError,
} from "../lib/dbErrors.js";
import { databaseUrlFingerprint } from "../lib/databaseUrlFingerprint.js";
import { signToken, authMiddleware } from "../middleware/auth.js";
import { SLUG_RE, bootstrapOrganization } from "../lib/organizationBootstrap.js";
import { normalizeBusinessVertical } from "../lib/businessVertical.js";
import { buildSessionUser } from "../lib/sessionUser.js";

const router = Router();

/**
 * إنشاء شركة (مؤسسة) جديدة + فرع رئيسي + مدير ADMIN.
 * إما ALLOW_PUBLIC_ORG_REGISTRATION=true على الخادم، أو تطابق registrationSecret مع ORG_REGISTRATION_SECRET (8+ أحرف).
 */
router.post("/register-organization", async (req, res, next) => {
  try {
    const allowPublic =
      String(process.env.ALLOW_PUBLIC_ORG_REGISTRATION || "")
        .toLowerCase()
        .trim() === "true";
    const serverSecret = process.env.ORG_REGISTRATION_SECRET;
    const hasStrongSecret =
      serverSecret != null && String(serverSecret).trim().length >= 8;

    if (!allowPublic && !hasStrongSecret) {
      return res.status(403).json({
        error:
          "إنشاء حساب من الواجهة معطّل. على الخادم فعّل ALLOW_PUBLIC_ORG_REGISTRATION=true أو ضع ORG_REGISTRATION_SECRET (8 أحرف على الأقل).",
      });
    }

    const {
      registrationSecret,
      organizationName,
      organizationSlug,
      branchName,
      adminEmail,
      adminPassword,
      adminName,
      businessVertical: businessVerticalRaw,
    } = req.body || {};

    if (!allowPublic && registrationSecret !== serverSecret) {
      return res.status(401).json({ error: "رمز التسجيل غير صحيح" });
    }

    const businessVertical =
      normalizeBusinessVertical(businessVerticalRaw, {
        required: false,
        mvpOnly: false,
      }) || "PET_STORE";
    const name =
      organizationName != null && String(organizationName).trim()
        ? String(organizationName).trim()
        : "Nennus Catio";
    const slugRaw =
      organizationSlug != null && String(organizationSlug).trim()
        ? String(organizationSlug).trim().toLowerCase()
        : "nennus-catio";
    if (!SLUG_RE.test(slugRaw)) {
      return res.status(400).json({
        error: "الرمز يجب أن يكون أحرفاً صغيرة وأرقاماً وشرطات فقط (مثل ezoo أو my-store)",
      });
    }
    if (!adminEmail?.trim() || !adminPassword || !adminName?.trim()) {
      return res.status(400).json({ error: "الاسم والبريد وكلمة المرور مطلوبة" });
    }
    if (String(adminPassword).length < 6) {
      return res.status(400).json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" });
    }
    const emailNorm = String(adminEmail).toLowerCase().trim();

    const existingSlug = await prisma.organization.findUnique({
      where: { slug: slugRaw },
    });
    if (existingSlug) {
      return res.status(409).json({ error: "هذا الرمز مستخدم لمؤسسة أخرى. اختر اسماً مختلفاً." });
    }

    const result = await bootstrapOrganization(prisma, {
      organizationName: name,
      organizationSlug: slugRaw,
      branchName: branchName || "Main",
      adminEmail: emailNorm,
      adminPassword,
      adminName,
      businessVertical,
      onboardingComplete: true,
    });

    const token = signToken({
      sub: result.user.id,
      role: result.user.role,
      branchId: result.user.branchId,
      organizationId: result.user.organizationId,
    });

    const sessionUser = await buildSessionUser(
      prisma,
      result.user,
      result.org,
      result.branch
    );

    res.status(201).json({
      token,
      user: sessionUser,
    });
  } catch (e) {
    if (e?.code === "P2002") {
      return res.status(409).json({
        error: "تعارض: البريد قد يكون مسجلاً في هذه المؤسسة أو الرمز مكرر.",
      });
    }
    if (isDbUnavailableError(e)) {
      console.error("[auth/register-organization] database:", e.message);
      return res.status(503).json({ error: dbUnavailableMessage, urlInfo: databaseUrlFingerprint() });
    }
    next(e);
  }
});

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
      });
    } else {
      const matches = await prisma.user.findMany({
        where: { email: emailNorm },
        include: { branch: true, organization: true },
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
    const token = signToken({
      sub: user.id,
      role: user.role,
      branchId: user.branchId,
      organizationId: user.organizationId,
    });
    const sessionUser = await buildSessionUser(prisma, user, user.organization, user.branch);
    res.json({
      token,
      user: sessionUser,
    });
  } catch (e) {
    if (isDbUnavailableError(e)) {
      console.error("[auth/login] database:", e.message);
      return res.status(503).json({ error: dbUnavailableMessage, urlInfo: databaseUrlFingerprint() });
    }
    next(e);
  }
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
