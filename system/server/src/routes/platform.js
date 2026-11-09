import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { findBranchInOrg } from "../lib/orgScope.js";
import { findOrganizationOwnerId, isOrganizationOwner } from "../lib/orgOwner.js";
import {
  dbUnavailableMessage,
  isDbUnavailableError,
} from "../lib/dbErrors.js";
import { authMiddleware } from "../middleware/auth.js";
import { requirePlatformAdmin } from "../middleware/platformAdmin.js";
import { SLUG_RE, bootstrapOrganization } from "../lib/organizationBootstrap.js";
import { normalizeBusinessVertical } from "../lib/businessVertical.js";

const router = Router();

router.use(authMiddleware);
router.use((req, res, next) => {
  requirePlatformAdmin(req, res, next).catch(next);
});

router.get("/organizations", async (_req, res, next) => {
  try {
    const rows = await prisma.organization.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        slug: true,
        businessVertical: true,
        plan: true,
        maxBranches: true,
        country: true,
        profileDocsDone: true,
        paymentDone: true,
        onboardingReviewStatus: true,
        createdAt: true,
        _count: { select: { users: true, branches: true } },
      },
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.post("/organizations", async (req, res, next) => {
  try {
    const {
      organizationName,
      organizationSlug,
      branchName,
      adminEmail,
      adminPassword,
      adminName,
      businessVertical: bvRaw,
    } = req.body || {};
    const name =
      organizationName != null ? String(organizationName).trim() : "";
    const slugRaw =
      organizationSlug != null ? String(organizationSlug).trim().toLowerCase() : "";
    if (!name) return res.status(400).json({ error: "اسم الشركة مطلوب" });
    if (!slugRaw) return res.status(400).json({ error: "رمز المؤسسة (slug) مطلوب" });
    if (!SLUG_RE.test(slugRaw)) {
      return res.status(400).json({
        error: "الرمز يجب أن يكون أحرفاً صغيرة وأرقاماً وشرطات فقط",
      });
    }
    if (!adminEmail?.trim() || !adminPassword || !adminName?.trim()) {
      return res.status(400).json({ error: "البريد واسم المدير وكلمة المرور مطلوبة" });
    }
    if (String(adminPassword).length < 6) {
      return res.status(400).json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" });
    }

    const existingSlug = await prisma.organization.findUnique({
      where: { slug: slugRaw },
    });
    if (existingSlug) {
      return res.status(409).json({ error: "هذا الرمز مستخدم لمؤسسة أخرى" });
    }

    const bvNorm = normalizeBusinessVertical(bvRaw, { required: false });
    if (bvRaw != null && String(bvRaw).trim() !== "" && bvNorm === undefined) {
      return res.status(400).json({ error: "مجال النشاط غير صالح" });
    }

    const { org, branch, user } = await bootstrapOrganization(prisma, {
      organizationName: name,
      organizationSlug: slugRaw,
      branchName,
      adminEmail,
      adminPassword,
      adminName,
      onboardingComplete: true,
      ...(bvNorm ? { businessVertical: bvNorm } : {}),
    });

    res.status(201).json({
      organization: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        businessVertical: org.businessVertical ?? null,
        createdAt: org.createdAt,
      },
      branch: { id: branch.id, name: branch.name },
      adminUser: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (e) {
    if (e?.code === "P2002") {
      return res.status(409).json({ error: "تعارض: بريد أو رمز مكرر" });
    }
    if (isDbUnavailableError(e)) {
      console.error("[platform/organizations POST]", e.message);
      return res.status(503).json({ error: dbUnavailableMessage });
    }
    next(e);
  }
});

router.patch("/organizations/:id", async (req, res, next) => {
  try {
    const { name, slug, businessVertical: bvRaw } = req.body || {};
    const org = await prisma.organization.findUnique({
      where: { id: req.params.id },
    });
    if (!org) return res.status(404).json({ error: "المؤسسة غير موجودة" });

    const data = {};
    if (name != null) data.name = String(name).trim().slice(0, 200);
    if (slug != null) {
      const slugRaw = String(slug).trim().toLowerCase();
      if (!SLUG_RE.test(slugRaw)) {
        return res.status(400).json({ error: "رمز غير صالح" });
      }
      const clash = await prisma.organization.findFirst({
        where: { slug: slugRaw, NOT: { id: org.id } },
      });
      if (clash) return res.status(409).json({ error: "الرمز مستخدم" });
      data.slug = slugRaw;
    }
    if (bvRaw !== undefined) {
      if (bvRaw == null || String(bvRaw).trim() === "") {
        data.businessVertical = null;
      } else {
        const bvNorm = normalizeBusinessVertical(bvRaw, { required: false });
        if (bvNorm === undefined) {
          return res.status(400).json({ error: "مجال النشاط غير صالح" });
        }
        data.businessVertical = bvNorm;
      }
    }
    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: "لا توجد حقول للتحديث" });
    }

    const updated = await prisma.organization.update({
      where: { id: org.id },
      data,
      select: {
        id: true,
        name: true,
        slug: true,
        businessVertical: true,
        createdAt: true,
        _count: { select: { users: true, branches: true } },
      },
    });
    res.json(updated);
  } catch (e) {
    if (e?.code === "P2002") {
      return res.status(409).json({ error: "تعارض في البيانات" });
    }
    next(e);
  }
});

router.post("/organizations/:id/plan-purchases", async (req, res, next) => {
  try {
    const { plan, maxBranches, amount, currency, reference, note, purchasedAt } =
      req.body || {};
    const planValue = String(plan || "")
      .trim()
      .toUpperCase();
    if (!["FREE", "PREMIUM"].includes(planValue)) {
      return res.status(400).json({ error: "Invalid plan", code: "INVALID_PLAN" });
    }

    const branchLimit = Number(maxBranches);
    if (!Number.isInteger(branchLimit) || branchLimit < 1 || branchLimit > 1000) {
      return res.status(400).json({ error: "Invalid branch limit", code: "INVALID_BRANCH_LIMIT" });
    }

    const amountValue =
      amount === "" || amount == null ? null : Number(String(amount).replace(",", "."));
    if (amountValue != null && (!Number.isFinite(amountValue) || amountValue < 0)) {
      return res.status(400).json({ error: "Invalid purchase amount", code: "INVALID_AMOUNT" });
    }

    const organization = await prisma.organization.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });
    if (!organization) {
      return res.status(404).json({ error: "Organization not found", code: "NOT_FOUND" });
    }

    const currentBranchCount = await prisma.branch.count({
      where: { organizationId: organization.id },
    });
    if (branchLimit < currentBranchCount) {
      return res.status(400).json({
        error: `Branch limit (${branchLimit}) cannot be lower than current branches (${currentBranchCount})`,
        code: "PLAN_LIMIT_TOO_LOW",
        maxBranches: branchLimit,
        branchCount: currentBranchCount,
      });
    }

    const purchaseDate = purchasedAt ? new Date(purchasedAt) : new Date();
    if (Number.isNaN(purchaseDate.getTime())) {
      return res.status(400).json({ error: "Invalid purchase date", code: "INVALID_DATE" });
    }

    const [updated, purchase] = await prisma.$transaction([
      prisma.organization.update({
        where: { id: organization.id },
        data: { plan: planValue, maxBranches: branchLimit },
        select: {
          id: true,
          name: true,
          slug: true,
          plan: true,
          maxBranches: true,
          createdAt: true,
          _count: { select: { users: true, branches: true } },
        },
      }),
      prisma.organizationPlanPurchase.create({
        data: {
          organizationId: organization.id,
          plan: planValue,
          amount: amountValue,
          currency: String(currency || "SAR")
            .trim()
            .toUpperCase()
            .slice(0, 8),
          reference: reference ? String(reference).trim().slice(0, 200) : null,
          note: note ? String(note).trim().slice(0, 500) : null,
          purchasedAt: purchaseDate,
        },
      }),
    ]);

    res.status(201).json({
      organization: updated,
      purchase: {
        ...purchase,
        amount: purchase.amount == null ? null : Number(purchase.amount),
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get("/branches", async (req, res, next) => {
  try {
    const oid = req.query.organizationId;
    if (!oid || !String(oid).trim()) {
      return res.status(400).json({ error: "organizationId مطلوب" });
    }
    const org = await prisma.organization.findUnique({
      where: { id: String(oid).trim() },
    });
    if (!org) return res.status(404).json({ error: "مؤسسة غير موجودة" });
    const branches = await prisma.branch.findMany({
      where: { organizationId: org.id },
      orderBy: { name: "asc" },
      select: { id: true, name: true, nameEn: true },
    });
    res.json(branches);
  } catch (e) {
    next(e);
  }
});

router.get("/users", async (req, res, next) => {
  try {
    const orgFilter = req.query.organizationId;
    const where =
      orgFilter && String(orgFilter).trim()
        ? { organizationId: String(orgFilter).trim() }
        : {};

    const users = await prisma.user.findMany({
      where,
      orderBy: [{ organizationId: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        email: true,
        name: true,
        nameEn: true,
        role: true,
        branchId: true,
        organizationId: true,
        createdAt: true,
        branch: { select: { name: true, nameEn: true } },
        organization: { select: { id: true, name: true, slug: true } },
      },
    });
    res.json(users);
  } catch (e) {
    next(e);
  }
});

router.post("/users", async (req, res, next) => {
  try {
    const { organizationId, email, password, name, nameEn, role, branchId } = req.body || {};
    if (!organizationId?.trim() || !email?.trim() || !password || !name?.trim()) {
      return res.status(400).json({ error: "المؤسسة والبريد والاسم وكلمة المرور مطلوبة" });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ error: "كلمة المرور يجب ألا تقل عن 6 أحرف" });
    }
    if (!["ADMIN", "MANAGER", "CASHIER"].includes(String(role))) {
      return res.status(400).json({ error: "دور غير صالح" });
    }

    const org = await prisma.organization.findUnique({
      where: { id: String(organizationId).trim() },
    });
    if (!org) return res.status(400).json({ error: "مؤسسة غير موجودة" });

    const roleStr = String(role);
    const resolvedBranchId =
      branchId != null && String(branchId).trim() ? String(branchId).trim() : null;
    if (roleStr !== "ADMIN" && !resolvedBranchId) {
      return res.status(400).json({ error: "يجب تعيين فرع للمستخدم" });
    }
    if (resolvedBranchId) {
      const b = await findBranchInOrg(prisma, org.id, resolvedBranchId);
      if (!b) return res.status(400).json({ error: "فرع غير صالح" });
    }

    const maxUsers = 10;
    const userCount = await prisma.user.count({ where: { organizationId: org.id } });
    if (userCount >= maxUsers) {
      return res.status(403).json({
        error: `تم بلوغ الحد الأقصى للمستخدمين (${maxUsers})`,
        code: "USER_LIMIT",
        maxUsers,
      });
    }

    const hash = await bcrypt.hash(String(password), 10);
    const user = await prisma.user.create({
      data: {
        organizationId: org.id,
        email: String(email).toLowerCase().trim(),
        passwordHash: hash,
        name: name.trim(),
        nameEn: nameEn?.trim() || null,
        role: roleStr,
        branchId: resolvedBranchId,
      },
      select: {
        id: true,
        email: true,
        name: true,
        nameEn: true,
        role: true,
        branchId: true,
        organizationId: true,
        branch: { select: { name: true, nameEn: true } },
        organization: { select: { id: true, name: true, slug: true } },
      },
    });
    res.status(201).json(user);
  } catch (e) {
    if (e?.code === "P2002") {
      return res.status(409).json({ error: "البريد مسجّل في هذه المؤسسة" });
    }
    next(e);
  }
});

router.patch("/users/:id", async (req, res, next) => {
  try {
    const { name, nameEn, role, branchId, password } = req.body || {};
    const target = await prisma.user.findUnique({
      where: { id: req.params.id },
    });
    if (!target) return res.status(404).json({ error: "غير موجود" });

    if (await isOrganizationOwner(prisma, target.organizationId, target.id)) {
      return res.status(403).json({
        error: "لا يمكن تعديل حساب مالك المؤسسة (المشرف الأعلى)",
        code: "ORG_OWNER_LOCKED",
      });
    }

    if (branchId) {
      const b = await findBranchInOrg(prisma, target.organizationId, branchId);
      if (!b) return res.status(400).json({ error: "فرع غير صالح" });
    }

    const data = {};
    if (name != null) data.name = String(name).trim();
    if (nameEn !== undefined) data.nameEn = nameEn?.trim() || null;
    if (role && ["ADMIN", "MANAGER", "CASHIER"].includes(String(role))) {
      data.role = String(role);
    }
    if (branchId !== undefined) data.branchId = branchId || null;
    const nextRole = data.role || target.role;
    const nextBranch = branchId !== undefined ? branchId || null : target.branchId;
    if (nextRole !== "ADMIN" && !nextBranch) {
      return res.status(400).json({ error: "يجب تعيين فرع للمستخدم" });
    }
    if (password) {
      if (String(password).length < 6) {
        return res.status(400).json({ error: "كلمة المرور يجب ألا تقل عن 6 أحرف" });
      }
      data.passwordHash = await bcrypt.hash(String(password), 10);
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: "لا توجد حقول للتحديث" });
    }

    const user = await prisma.user.update({
      where: { id: target.id },
      data,
      select: {
        id: true,
        email: true,
        name: true,
        nameEn: true,
        role: true,
        branchId: true,
        organizationId: true,
        branch: { select: { name: true, nameEn: true } },
        organization: { select: { id: true, name: true, slug: true } },
      },
    });
    res.json(user);
  } catch (e) {
    next(e);
  }
});

router.delete("/users/:id", async (req, res, next) => {
  try {
    if (req.params.id === req.user.sub) {
      return res.status(400).json({ error: "لا يمكن حذف حسابك الحالي" });
    }
    const target = await prisma.user.findUnique({
      where: { id: req.params.id },
    });
    if (!target) return res.status(404).json({ error: "غير موجود" });
    if (await isOrganizationOwner(prisma, target.organizationId, target.id)) {
      return res.status(403).json({
        error: "لا يمكن حذف حساب مالك المؤسسة (المشرف الأعلى)",
        code: "ORG_OWNER_LOCKED",
      });
    }
    await prisma.user.delete({ where: { id: target.id } });
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});

/** Dashboard analytics for platform console */
router.get("/analytics", async (_req, res, next) => {
  try {
    const [
      orgCount,
      userCount,
      pendingReviews,
      approvedOrgs,
      rejectedOrgs,
      paymentAgg,
      recentPurchases,
      byCountry,
      byPlan,
    ] = await Promise.all([
      prisma.organization.count(),
      prisma.user.count(),
      prisma.organization.count({ where: { onboardingReviewStatus: "PENDING_REVIEW" } }),
      prisma.organization.count({ where: { onboardingReviewStatus: "APPROVED" } }),
      prisma.organization.count({ where: { onboardingReviewStatus: "REJECTED" } }),
      prisma.organizationPlanPurchase.aggregate({
        _sum: { amount: true },
        _count: true,
      }),
      prisma.organizationPlanPurchase.findMany({
        orderBy: { purchasedAt: "desc" },
        take: 8,
        include: {
          organization: { select: { id: true, name: true, country: true } },
        },
      }),
      prisma.organization.groupBy({
        by: ["country"],
        _count: { _all: true },
      }),
      prisma.organization.groupBy({
        by: ["plan"],
        _count: { _all: true },
      }),
    ]);

    res.json({
      orgCount,
      userCount,
      pendingReviews,
      approvedOrgs,
      rejectedOrgs,
      paymentsCount: paymentAgg._count || 0,
      paymentsTotalSar: Number(paymentAgg._sum?.amount || 0),
      currencyCharge: "SAR",
      recentPurchases: recentPurchases.map((p) => ({
        id: p.id,
        organizationId: p.organizationId,
        organizationName: p.organization?.name,
        country: p.organization?.country,
        plan: p.plan,
        amount: p.amount != null ? Number(p.amount) : null,
        currency: p.currency || "SAR",
        reference: p.reference,
        purchasedAt: p.purchasedAt,
      })),
      byCountry: byCountry.map((r) => ({
        country: r.country || "—",
        count: r._count._all,
      })),
      byPlan: byPlan.map((r) => ({
        plan: r.plan || "FREE",
        count: r._count._all,
      })),
    });
  } catch (e) {
    next(e);
  }
});

/** Onboarding KYC queue */
router.get("/onboarding-queue", async (req, res, next) => {
  try {
    const status = String(req.query.status || "PENDING_REVIEW").toUpperCase();
    const where =
      status === "ALL"
        ? { profileDocsDone: true }
        : { onboardingReviewStatus: status };

    const rows = await prisma.organization.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: 200,
      select: {
        id: true,
        name: true,
        slug: true,
        legalName: true,
        country: true,
        city: true,
        businessVertical: true,
        plan: true,
        profileDocsDone: true,
        paymentDone: true,
        onboardingReviewStatus: true,
        onboardingReviewNote: true,
        onboardingReviewedAt: true,
        selectedPlanInterval: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { users: true, onboardingDocuments: true } },
      },
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.get("/organizations/:id/onboarding", async (req, res, next) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: req.params.id },
      include: {
        onboardingDocuments: {
          select: {
            id: true,
            docType: true,
            fileName: true,
            mimeType: true,
            size: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        users: {
          where: { role: "ADMIN" },
          take: 5,
          select: { id: true, email: true, name: true, createdAt: true },
        },
        planPurchases: {
          orderBy: { purchasedAt: "desc" },
          take: 10,
        },
        taxSettings: true,
      },
    });
    if (!org) return res.status(404).json({ error: "Organization not found" });
    res.json({
      organization: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        legalName: org.legalName,
        country: org.country,
        city: org.city,
        addressText: org.addressText,
        crNumber: org.crNumber,
        licenseNumber: org.licenseNumber,
        ownerFullName: org.ownerFullName,
        ownerIdNumber: org.ownerIdNumber,
        ownerPhone: org.ownerPhone,
        vatNumber: org.vatNumber,
        taxNumber: org.taxNumber,
        iban: org.iban,
        authorizedPersonName: org.authorizedPersonName,
        businessVertical: org.businessVertical,
        plan: org.plan,
        profileDocsDone: org.profileDocsDone,
        paymentDone: org.paymentDone,
        onboardingReviewStatus: org.onboardingReviewStatus,
        onboardingReviewNote: org.onboardingReviewNote,
        onboardingReviewedAt: org.onboardingReviewedAt,
        onboardingReviewedBy: org.onboardingReviewedBy,
        selectedPlanInterval: org.selectedPlanInterval,
        stripeCustomerId: org.stripeCustomerId,
        stripeSubscriptionId: org.stripeSubscriptionId,
        termsAcceptedAt: org.termsAcceptedAt,
        createdAt: org.createdAt,
        updatedAt: org.updatedAt,
      },
      documents: org.onboardingDocuments,
      admins: org.users,
      purchases: org.planPurchases,
      taxSettings: org.taxSettings,
    });
  } catch (e) {
    next(e);
  }
});

router.get("/organizations/:id/documents/:docType", async (req, res, next) => {
  try {
    const docType = String(req.params.docType || "").toUpperCase();
    const doc = await prisma.organizationDocument.findUnique({
      where: {
        organizationId_docType: {
          organizationId: req.params.id,
          docType,
        },
      },
    });
    if (!doc) return res.status(404).json({ error: "Document not found" });
    res.setHeader("Content-Type", doc.mimeType);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(doc.fileName)}"`
    );
    res.send(Buffer.from(doc.data));
  } catch (e) {
    next(e);
  }
});

router.post("/organizations/:id/onboarding/approve", async (req, res, next) => {
  try {
    const note = req.body?.note != null ? String(req.body.note).trim().slice(0, 500) : null;
    const org = await prisma.organization.findUnique({ where: { id: req.params.id } });
    if (!org) return res.status(404).json({ error: "Organization not found" });
    if (!org.profileDocsDone) {
      return res.status(400).json({ error: "Organization has not submitted documents yet" });
    }
    const updated = await prisma.organization.update({
      where: { id: org.id },
      data: {
        onboardingReviewStatus: "APPROVED",
        onboardingReviewedAt: new Date(),
        onboardingReviewedBy: req.user.sub,
        onboardingReviewNote: note,
      },
    });

    const adminUser = await prisma.user.findFirst({
      where: { organizationId: org.id, role: "ADMIN" },
      orderBy: { createdAt: "asc" },
      select: { email: true },
    });
    let notify = null;
    try {
      const { notifyOnboardingDecision } = await import("../lib/onboardingNotify.js");
      notify = await notifyOnboardingDecision({
        org: updated,
        event: "approved",
        note,
        adminEmail: adminUser?.email || null,
        actorUserId: req.user.sub,
      });
    } catch (e) {
      console.warn("[platform/approve] notify failed", e?.message || e);
      notify = { error: e?.message || String(e) };
    }

    res.json({
      id: updated.id,
      onboardingReviewStatus: updated.onboardingReviewStatus,
      onboardingReviewedAt: updated.onboardingReviewedAt,
      onboardingReviewNote: updated.onboardingReviewNote,
      notify,
    });
  } catch (e) {
    next(e);
  }
});

router.post("/organizations/:id/onboarding/reject", async (req, res, next) => {
  try {
    const note = String(req.body?.note || "").trim();
    if (note.length < 3) {
      return res.status(400).json({ error: "Rejection note is required (min 3 characters)" });
    }
    const org = await prisma.organization.findUnique({ where: { id: req.params.id } });
    if (!org) return res.status(404).json({ error: "Organization not found" });

    const adminUser = await prisma.user.findFirst({
      where: { organizationId: org.id, role: "ADMIN" },
      orderBy: { createdAt: "asc" },
      select: { email: true },
    });

    const updated = await prisma.organization.update({
      where: { id: org.id },
      data: {
        onboardingReviewStatus: "REJECTED",
        onboardingReviewedAt: new Date(),
        onboardingReviewedBy: req.user.sub,
        onboardingReviewNote: note.slice(0, 500),
        // Allow resubmitting profile/docs
        profileDocsDone: false,
      },
    });

    let notify = null;
    try {
      const { notifyOnboardingDecision } = await import("../lib/onboardingNotify.js");
      notify = await notifyOnboardingDecision({
        org: { ...updated, ownerPhone: org.ownerPhone, ownerFullName: org.ownerFullName },
        event: "rejected",
        note: note.slice(0, 500),
        adminEmail: adminUser?.email || null,
        actorUserId: req.user.sub,
      });
    } catch (e) {
      console.warn("[platform/reject] notify failed", e?.message || e);
      notify = { error: e?.message || String(e) };
    }

    res.json({
      id: updated.id,
      onboardingReviewStatus: updated.onboardingReviewStatus,
      onboardingReviewedAt: updated.onboardingReviewedAt,
      onboardingReviewNote: updated.onboardingReviewNote,
      notify,
    });
  } catch (e) {
    next(e);
  }
});

export default router;
