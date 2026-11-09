import { Router } from "express";
import { Prisma } from "../lib/prisma-client-bundle.js";
import { prisma } from "../lib/prisma.js";
import { findBranchInOrg } from "../lib/orgScope.js";
import { authMiddleware, requireRole, requirePermission } from "../middleware/auth.js";
import { writeAudit } from "../lib/auditLog.js";
import { httpError, sendError } from "../lib/apiError.js";
import { normalizeCouponCode } from "../lib/loyalty.js";
import {
  buildBundleSuggestions,
  buildMarkdownSuggestions,
  buildPriceRecommendations,
  buildPricingOverview,
  simulateMarginImpact,
} from "../lib/intelligentPricing.js";
import { clampInt } from "../lib/smartInventory.js";

const router = Router();
router.use(authMiddleware);

async function assertBranchAccess(req, branchId) {
  if (!branchId) throw httpError(400, "يجب اختيار الفرع", "Branch is required");
  if (
    req.user.role !== "ADMIN" &&
    req.user.branchId &&
    req.user.branchId !== branchId
  ) {
    throw httpError(403, "لا يمكن الوصول لفرع آخر", "Cannot access another branch");
  }
  const branchOk = await findBranchInOrg(prisma, req.user.organizationId, branchId);
  if (!branchOk) throw httpError(400, "فرع غير صالح", "Invalid branch");
}

function draftInclude() {
  return {
    items: {
      include: {
        product: {
          select: {
            id: true,
            name: true,
            nameEn: true,
            sku: true,
            barcode: true,
            price: true,
            cost: true,
          },
        },
      },
    },
    coupon: { select: { id: true, code: true, kind: true, value: true, active: true } },
    branch: { select: { id: true, name: true } },
    user: { select: { id: true, name: true } },
  };
}

function toDec(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return new Prisma.Decimal(n.toFixed(2));
}

router.get(
  "/overview",
  requireRole("ADMIN", "MANAGER"),
  requirePermission("productsEdit"),
  async (req, res) => {
    const branchId = String(req.query.branchId || req.user.branchId || "");
    await assertBranchAccess(req, branchId);
    const overview = await buildPricingOverview({
      orgId: req.user.organizationId,
      branchId,
      withinDays: clampInt(req.query.withinDays, 1, 60, 14),
      lookbackDays: clampInt(req.query.lookbackDays, 7, 120, 30),
    });
    res.json(overview);
  },
);

router.get(
  "/markdowns",
  requireRole("ADMIN", "MANAGER"),
  requirePermission("productsEdit"),
  async (req, res) => {
    const branchId = String(req.query.branchId || req.user.branchId || "");
    await assertBranchAccess(req, branchId);
    const board = await buildMarkdownSuggestions({
      orgId: req.user.organizationId,
      branchId,
      withinDays: clampInt(req.query.withinDays, 1, 60, 14),
      minMarginPct: clampInt(req.query.minMarginPct, 0, 40, 5),
    });
    res.json({ branchId, ...board });
  },
);

router.get(
  "/recommendations",
  requireRole("ADMIN", "MANAGER"),
  requirePermission("productsEdit"),
  async (req, res) => {
    const branchId = String(req.query.branchId || req.user.branchId || "");
    await assertBranchAccess(req, branchId);
    const board = await buildPriceRecommendations({
      orgId: req.user.organizationId,
      branchId,
      lookbackDays: clampInt(req.query.lookbackDays, 7, 120, 30),
      minMarginPct: clampInt(req.query.minMarginPct, 0, 40, 5),
    });
    res.json({ branchId, ...board });
  },
);

router.get(
  "/bundles",
  requireRole("ADMIN", "MANAGER"),
  requirePermission("productsEdit"),
  async (req, res) => {
    const branchId = String(req.query.branchId || req.user.branchId || "");
    await assertBranchAccess(req, branchId);
    const board = await buildBundleSuggestions({
      orgId: req.user.organizationId,
      branchId,
      lookbackDays: clampInt(req.query.lookbackDays, 14, 120, 45),
      limit: clampInt(req.query.limit, 5, 50, 20),
    });
    res.json({ branchId, ...board });
  },
);

router.post(
  "/simulate",
  requireRole("ADMIN", "MANAGER"),
  requirePermission("productsEdit"),
  async (req, res) => {
    const orgId = req.user.organizationId;
    const b = req.body || {};
    let price = Number(b.price);
    let cost = Number(b.cost);
    let estimatedUnits = Number(b.estimatedUnits);

    if (b.productId) {
      const product = await prisma.product.findFirst({
        where: { id: String(b.productId), organizationId: orgId },
        select: { id: true, name: true, nameEn: true, price: true, cost: true },
      });
      if (!product) {
        return sendError(res, 404, "منتج غير موجود", "Product not found");
      }
      if (!Number.isFinite(price)) price = Number(product.price) || 0;
      if (!Number.isFinite(cost)) cost = product.cost != null ? Number(product.cost) : 0;

      if (!Number.isFinite(estimatedUnits) || estimatedUnits <= 0) {
        const branchId = String(b.branchId || req.user.branchId || "");
        if (branchId) {
          const since = new Date();
          since.setDate(since.getDate() - 30);
          const sold = await prisma.saleItem.aggregate({
            where: {
              productId: product.id,
              sale: {
                branchId,
                branch: { organizationId: orgId },
                createdAt: { gte: since },
              },
            },
            _sum: { quantity: true },
          });
          estimatedUnits = Number(sold._sum.quantity || 0);
        }
      }

      const sim = simulateMarginImpact({
        price,
        cost,
        discountPercent: Number(b.discountPercent) || 0,
        estimatedUnits: estimatedUnits || 0,
        elasticity: Number(b.elasticity) || 1.2,
      });
      return res.json({ product, simulation: sim });
    }

    if (!Number.isFinite(price) || price < 0) {
      return sendError(res, 400, "السعر غير صالح", "Invalid price");
    }
    const sim = simulateMarginImpact({
      price,
      cost: Number.isFinite(cost) ? cost : 0,
      discountPercent: Number(b.discountPercent) || 0,
      estimatedUnits: Number.isFinite(estimatedUnits) ? estimatedUnits : 0,
      elasticity: Number(b.elasticity) || 1.2,
    });
    res.json({ simulation: sim });
  },
);

router.get(
  "/drafts",
  requireRole("ADMIN", "MANAGER"),
  requirePermission("productsEdit"),
  async (req, res) => {
    const orgId = req.user.organizationId;
    const status = String(req.query.status || "OPEN").trim().toUpperCase();
    const where = { organizationId: orgId };
    if (status && status !== "ALL") where.status = status;
    if (req.query.branchId) {
      const branchId = String(req.query.branchId);
      await assertBranchAccess(req, branchId);
      where.branchId = branchId;
    }
    const drafts = await prisma.promoDraft.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: draftInclude(),
    });
    res.json({ drafts });
  },
);

router.get(
  "/drafts/:id",
  requireRole("ADMIN", "MANAGER"),
  requirePermission("productsEdit"),
  async (req, res) => {
    const draft = await prisma.promoDraft.findFirst({
      where: { id: String(req.params.id), organizationId: req.user.organizationId },
      include: draftInclude(),
    });
    if (!draft) return sendError(res, 404, "مسودة غير موجودة", "Draft not found");
    res.json(draft);
  },
);

router.post(
  "/drafts",
  requireRole("ADMIN", "MANAGER"),
  requirePermission("productsEdit"),
  async (req, res) => {
    const orgId = req.user.organizationId;
    const b = req.body || {};
    let branchId = b.branchId != null && String(b.branchId).trim() ? String(b.branchId) : null;
    if (branchId) await assertBranchAccess(req, branchId);
    else branchId = req.user.branchId || null;

    const itemsRaw = Array.isArray(b.items) ? b.items : [];
    const lines = [];
    for (const raw of itemsRaw) {
      const productId = String(raw?.productId || "");
      if (!productId) continue;
      const action = ["PERCENT_OFF", "SET_PRICE", "BUNDLE"].includes(String(raw?.action || ""))
        ? String(raw.action)
        : "PERCENT_OFF";
      lines.push({
        productId,
        action,
        currentPrice: toDec(raw.currentPrice),
        cost: toDec(raw.cost),
        suggestedPrice: toDec(raw.suggestedPrice),
        discountPercent: toDec(raw.discountPercent),
        reason: raw?.reason != null ? String(raw.reason).slice(0, 500) : null,
        buyQty:
          raw?.buyQty != null ? Math.max(1, Math.floor(Number(raw.buyQty) || 1)) : null,
        freeQty:
          raw?.freeQty != null ? Math.max(0, Math.floor(Number(raw.freeQty) || 0)) : null,
        pairedProductId: raw?.pairedProductId ? String(raw.pairedProductId) : null,
      });
    }
    if (!lines.length) {
      return sendError(res, 400, "لا توجد بنود صالحة", "No valid draft lines");
    }

    const products = await prisma.product.findMany({
      where: { organizationId: orgId, id: { in: lines.map((l) => l.productId) } },
      select: { id: true, price: true, cost: true },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    for (const line of lines) {
      const p = byId.get(line.productId);
      if (!p) {
        return sendError(
          res,
          400,
          `منتج غير موجود: ${line.productId}`,
          `Product not found: ${line.productId}`,
        );
      }
      if (line.currentPrice == null) line.currentPrice = p.price;
      if (line.cost == null && p.cost != null) line.cost = p.cost;
    }

    const kind = ["MARKDOWN", "PRICE_CHANGE", "COUPON", "BUNDLE"].includes(
      String(b.kind || "").toUpperCase(),
    )
      ? String(b.kind).toUpperCase()
      : "MARKDOWN";
    const source = ["WASTE", "VELOCITY", "MARGIN", "BUNDLE", "MANUAL"].includes(
      String(b.source || "").toUpperCase(),
    )
      ? String(b.source).toUpperCase()
      : "MANUAL";
    const applyMode = String(b.applyMode || "").toUpperCase() === "COUPON" ? "COUPON" : "PRICE";

    const draft = await prisma.promoDraft.create({
      data: {
        organizationId: orgId,
        branchId,
        userId: req.user.sub,
        status: "OPEN",
        kind,
        source,
        applyMode,
        title:
          b.title != null && String(b.title).trim()
            ? String(b.title).trim().slice(0, 120)
            : null,
        note:
          b.note != null && String(b.note).trim()
            ? String(b.note).trim().slice(0, 500)
            : null,
        items: { create: lines },
      },
      include: draftInclude(),
    });

    await writeAudit({
      userId: req.user.sub,
      action: "PROMO_DRAFT_CREATE",
      entityType: "PromoDraft",
      entityId: draft.id,
      branchId: branchId || undefined,
      summary: `Promo draft ${kind} lines ${draft.items.length}`,
    });

    res.status(201).json(draft);
  },
);

router.post(
  "/drafts/:id/cancel",
  requireRole("ADMIN", "MANAGER"),
  requirePermission("productsEdit"),
  async (req, res) => {
    const draft = await prisma.promoDraft.findFirst({
      where: { id: String(req.params.id), organizationId: req.user.organizationId },
    });
    if (!draft) return sendError(res, 404, "مسودة غير موجودة", "Draft not found");
    if (draft.status !== "OPEN") {
      return sendError(
        res,
        400,
        "لا يمكن إلغاء مسودة غير مفتوحة",
        "Only open drafts can be cancelled",
      );
    }
    const updated = await prisma.promoDraft.update({
      where: { id: draft.id },
      data: { status: "CANCELLED" },
      include: draftInclude(),
    });
    await writeAudit({
      userId: req.user.sub,
      action: "PROMO_DRAFT_CANCEL",
      entityType: "PromoDraft",
      entityId: draft.id,
      branchId: draft.branchId || undefined,
      summary: "Promo draft cancelled",
    });
    res.json(updated);
  },
);

router.post(
  "/drafts/:id/apply",
  requireRole("ADMIN", "MANAGER"),
  requirePermission("productsEdit"),
  async (req, res) => {
    const orgId = req.user.organizationId;
    const draft = await prisma.promoDraft.findFirst({
      where: { id: String(req.params.id), organizationId: orgId },
      include: { items: true },
    });
    if (!draft) return sendError(res, 404, "مسودة غير موجودة", "Draft not found");
    if (draft.status !== "OPEN") {
      return sendError(res, 400, "المسودة ليست مفتوحة", "Draft is not open");
    }
    if (!draft.items.length) {
      return sendError(res, 400, "المسودة فارغة", "Draft has no lines");
    }

    const applyMode =
      String(req.body?.applyMode || draft.applyMode || "PRICE").toUpperCase() === "COUPON"
        ? "COUPON"
        : "PRICE";

    try {
      if (applyMode === "PRICE") {
        const updates = [];
        for (const line of draft.items) {
          let nextPrice = line.suggestedPrice != null ? Number(line.suggestedPrice) : null;
          if (
            (nextPrice == null || !Number.isFinite(nextPrice)) &&
            line.discountPercent != null &&
            line.currentPrice != null
          ) {
            const cur = Number(line.currentPrice);
            const off = Number(line.discountPercent);
            nextPrice = Math.round(cur * (1 - off / 100) * 100) / 100;
          }
          if (nextPrice == null || !Number.isFinite(nextPrice) || nextPrice < 0) {
            return sendError(
              res,
              400,
              "سعر مقترح غير صالح على أحد البنود",
              "Invalid suggested price on a draft line",
            );
          }
          const product = await prisma.product.findFirst({
            where: { id: line.productId, organizationId: orgId },
            select: { id: true, price: true },
          });
          if (!product) {
            return sendError(res, 400, "منتج غير موجود", "Product not found");
          }
          updates.push({
            lineId: line.id,
            productId: product.id,
            previousPrice: product.price,
            nextPrice: new Prisma.Decimal(Number(nextPrice).toFixed(2)),
          });
        }

        await prisma.$transaction([
          ...updates.map((u) =>
            prisma.product.update({
              where: { id: u.productId },
              data: { price: u.nextPrice },
            }),
          ),
          ...updates.map((u) =>
            prisma.promoDraftItem.update({
              where: { id: u.lineId },
              data: { previousPrice: u.previousPrice },
            }),
          ),
          prisma.promoDraft.update({
            where: { id: draft.id },
            data: { status: "APPLIED", applyMode: "PRICE" },
          }),
        ]);

        await writeAudit({
          userId: req.user.sub,
          action: "PROMO_DRAFT_APPLY_PRICE",
          entityType: "PromoDraft",
          entityId: draft.id,
          branchId: draft.branchId || undefined,
          summary: `Applied price changes on ${updates.length} products`,
        });
      } else {
        // Create a store coupon from the draft (invoice-level promo at POS)
        const first = draft.items[0];
        let value = first.discountPercent != null ? Number(first.discountPercent) : 10;
        if (!Number.isFinite(value) || value <= 0) value = 10;
        if (value > 100) value = 100;
        const codeRaw =
          req.body?.couponCode ||
          `PROMO${Date.now().toString(36).toUpperCase().slice(-6)}`;
        const code = normalizeCouponCode(codeRaw);
        const validDays = clampInt(req.body?.validDays, 1, 90, 14);
        const until = new Date();
        until.setDate(until.getDate() + validDays);

        const noteParts = draft.items.slice(0, 8).map((it) => {
          const off =
            it.discountPercent != null ? `${Number(it.discountPercent)}%` : "promo";
          return `${it.productId.slice(0, 6)}:${off}`;
        });

        let coupon;
        try {
          coupon = await prisma.coupon.create({
            data: {
              organizationId: orgId,
              code,
              kind: "PERCENT",
              value,
              validUntil: until,
              active: true,
              channel: "RETAIL",
              note:
                draft.note ||
                draft.title ||
                `From pricing draft ${draft.id.slice(0, 8)} · ${noteParts.join(", ")}`,
              maxUsesTotal:
                req.body?.maxUsesTotal != null
                  ? Math.floor(Number(req.body.maxUsesTotal))
                  : null,
            },
          });
        } catch (e) {
          if (e?.code === "P2002") {
            return sendError(res, 400, "رمز الكوبون مستخدم", "Coupon code already used");
          }
          throw e;
        }

        await prisma.promoDraft.update({
          where: { id: draft.id },
          data: { status: "APPLIED", applyMode: "COUPON", couponId: coupon.id },
        });

        await writeAudit({
          userId: req.user.sub,
          action: "PROMO_DRAFT_APPLY_COUPON",
          entityType: "PromoDraft",
          entityId: draft.id,
          branchId: draft.branchId || undefined,
          summary: `Created coupon ${coupon.code}`,
        });
      }

      const updated = await prisma.promoDraft.findFirst({
        where: { id: draft.id },
        include: draftInclude(),
      });
      res.status(201).json(updated);
    } catch (e) {
      const status = e?.status || 400;
      return sendError(
        res,
        status,
        e instanceof Error ? e.message : "فشل تطبيق المسودة",
        e?.errorEn || (e instanceof Error ? e.message : "Failed to apply draft"),
      );
    }
  },
);

export default router;
