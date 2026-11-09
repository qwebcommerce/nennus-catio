import { Router } from "express";
import { Prisma } from "../lib/prisma-client-bundle.js";
import { prisma } from "../lib/prisma.js";
import { findBranchInOrg } from "../lib/orgScope.js";
import { authMiddleware, requireRole, requirePermission } from "../middleware/auth.js";
import {
  buildIntelligenceOverview,
  buildReorderRecommendations,
  buildWasteBoard,
  clampInt,
} from "../lib/smartInventory.js";
import { executeReceivePurchase } from "../lib/purchaseReceive.js";
import { writeAudit } from "../lib/auditLog.js";
import { httpError, sendError } from "../lib/apiError.js";

const router = Router();
router.use(authMiddleware);

async function assertBranchAccess(req, branchId) {
  if (!branchId) {
    throw httpError(400, "يجب اختيار الفرع", "Branch is required");
  }
  if (
    req.user.role !== "ADMIN" &&
    req.user.branchId &&
    req.user.branchId !== branchId
  ) {
    throw httpError(403, "لا يمكن الوصول لفرع آخر", "Cannot access another branch");
  }
  const branchOk = await findBranchInOrg(prisma, req.user.organizationId, branchId);
  if (!branchOk) {
    throw httpError(400, "فرع غير صالح", "Invalid branch");
  }
}

function draftInclude() {
  return {
    items: {
      include: {
        product: {
          select: { id: true, name: true, nameEn: true, sku: true, barcode: true, cost: true },
        },
      },
    },
    supplier: { select: { id: true, name: true } },
    branch: { select: { id: true, name: true } },
    user: { select: { id: true, name: true } },
  };
}

router.get(
  "/overview",
  requireRole("ADMIN", "MANAGER", "CASHIER"),
  requirePermission("purchases"),
  async (req, res) => {
    const branchId = String(req.query.branchId || req.user.branchId || "");
    await assertBranchAccess(req, branchId);
    const lookbackDays = clampInt(req.query.lookbackDays, 7, 120, 30);
    const targetStockDays = clampInt(req.query.targetStockDays, 7, 90, 21);
    const wasteWithinDays = clampInt(req.query.wasteWithinDays, 1, 120, 30);
    const overview = await buildIntelligenceOverview({
      orgId: req.user.organizationId,
      branchId,
      lookbackDays,
      targetStockDays,
      wasteWithinDays,
    });
    const { _wasteBoard, ...safe } = overview;
    res.json(safe);
  },
);

router.get(
  "/reorder",
  requireRole("ADMIN", "MANAGER", "CASHIER"),
  requirePermission("purchases"),
  async (req, res) => {
    const branchId = String(req.query.branchId || req.user.branchId || "");
    await assertBranchAccess(req, branchId);
    const lookbackDays = clampInt(req.query.lookbackDays, 7, 120, 30);
    const targetStockDays = clampInt(req.query.targetStockDays, 7, 90, 21);
    const minDailySales = Math.max(
      0,
      Number.parseFloat(String(req.query.minDailySales ?? "0.05")) || 0.05,
    );
    const recommendations = await buildReorderRecommendations({
      orgId: req.user.organizationId,
      branchId,
      lookbackDays,
      targetStockDays,
      minDailySales,
    });
    res.json({
      branchId,
      lookbackDays,
      targetStockDays,
      minDailySales,
      count: recommendations.length,
      recommendations,
    });
  },
);

router.get(
  "/waste",
  requireRole("ADMIN", "MANAGER", "CASHIER"),
  requirePermission("purchases"),
  async (req, res) => {
    const branchId = String(req.query.branchId || req.user.branchId || "");
    await assertBranchAccess(req, branchId);
    const withinDays = clampInt(req.query.withinDays, 1, 120, 30);
    const board = await buildWasteBoard({
      orgId: req.user.organizationId,
      branchId,
      withinDays,
    });
    res.json({ branchId, ...board });
  },
);

router.get(
  "/drafts",
  requireRole("ADMIN", "MANAGER", "CASHIER"),
  requirePermission("purchases"),
  async (req, res) => {
    const branchId = String(req.query.branchId || req.user.branchId || "");
    await assertBranchAccess(req, branchId);
    const status = String(req.query.status || "OPEN").trim().toUpperCase();
    const where = {
      organizationId: req.user.organizationId,
      branchId,
    };
    if (status && status !== "ALL") where.status = status;
    const drafts = await prisma.purchaseDraft.findMany({
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
  requireRole("ADMIN", "MANAGER", "CASHIER"),
  requirePermission("purchases"),
  async (req, res) => {
    const draft = await prisma.purchaseDraft.findFirst({
      where: {
        id: String(req.params.id),
        organizationId: req.user.organizationId,
      },
      include: draftInclude(),
    });
    if (!draft) return sendError(res, 404, "مسودة غير موجودة", "Draft not found");
    await assertBranchAccess(req, draft.branchId);
    res.json(draft);
  },
);

router.post(
  "/drafts",
  requireRole("ADMIN", "MANAGER", "CASHIER"),
  requirePermission("purchases"),
  async (req, res) => {
    const branchId = String(req.body?.branchId || req.user.branchId || "");
    await assertBranchAccess(req, branchId);
    const orgId = req.user.organizationId;
    const itemsRaw = Array.isArray(req.body?.items) ? req.body.items : [];
    const lines = [];
    for (const raw of itemsRaw) {
      const productId = String(raw?.productId || "");
      const quantity = Math.max(1, Math.floor(Number(raw?.quantity) || 0));
      if (!productId || quantity <= 0) continue;
      let unitCost = null;
      if (raw?.unitCost != null && raw.unitCost !== "") {
        const n = Number(raw.unitCost);
        if (!Number.isFinite(n) || n < 0) {
          return sendError(res, 400, "تكلفة الوحدة غير صالحة", "Invalid unit cost");
        }
        unitCost = new Prisma.Decimal(n.toFixed(2));
      }
      lines.push({
        productId,
        quantity,
        unitCost,
        reason: raw?.reason != null ? String(raw.reason).slice(0, 500) : null,
      });
    }
    if (!lines.length) {
      return sendError(res, 400, "لا توجد بنود صالحة للمسودة", "No valid draft lines");
    }

    const products = await prisma.product.findMany({
      where: { organizationId: orgId, id: { in: lines.map((l) => l.productId) } },
      select: { id: true, cost: true },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    for (const line of lines) {
      if (!byId.has(line.productId)) {
        return sendError(
          res,
          400,
          `منتج غير موجود: ${line.productId}`,
          `Product not found: ${line.productId}`,
        );
      }
      if (line.unitCost == null && byId.get(line.productId)?.cost != null) {
        line.unitCost = byId.get(line.productId).cost;
      }
    }

    let supplierId = null;
    if (req.body?.supplierId) {
      const s = await prisma.supplier.findFirst({
        where: { id: String(req.body.supplierId), organizationId: orgId },
      });
      if (!s) return sendError(res, 400, "مورد غير موجود", "Supplier not found");
      supplierId = s.id;
    }

    const source = String(req.body?.source || "REORDER").toUpperCase();
    const draft = await prisma.purchaseDraft.create({
      data: {
        organizationId: orgId,
        branchId,
        supplierId,
        userId: req.user.sub,
        status: "OPEN",
        source: ["REORDER", "MANUAL", "MIXED"].includes(source) ? source : "REORDER",
        note:
          req.body?.note != null && String(req.body.note).trim()
            ? String(req.body.note).trim().slice(0, 500)
            : null,
        items: {
          create: lines.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
            unitCost: l.unitCost,
            reason: l.reason,
          })),
        },
      },
      include: draftInclude(),
    });

    await writeAudit({
      userId: req.user.sub,
      action: "PURCHASE_DRAFT_CREATE",
      entityType: "PurchaseDraft",
      entityId: draft.id,
      branchId,
      summary: `Draft lines ${draft.items.length}`,
    });

    res.status(201).json(draft);
  },
);

router.post(
  "/drafts/:id/cancel",
  requireRole("ADMIN", "MANAGER", "CASHIER"),
  requirePermission("purchases"),
  async (req, res) => {
    const draft = await prisma.purchaseDraft.findFirst({
      where: {
        id: String(req.params.id),
        organizationId: req.user.organizationId,
      },
    });
    if (!draft) return sendError(res, 404, "مسودة غير موجودة", "Draft not found");
    await assertBranchAccess(req, draft.branchId);
    if (draft.status !== "OPEN") {
      return sendError(
        res,
        400,
        "لا يمكن إلغاء مسودة غير مفتوحة",
        "Only open drafts can be cancelled",
      );
    }
    const updated = await prisma.purchaseDraft.update({
      where: { id: draft.id },
      data: { status: "CANCELLED" },
      include: draftInclude(),
    });
    await writeAudit({
      userId: req.user.sub,
      action: "PURCHASE_DRAFT_CANCEL",
      entityType: "PurchaseDraft",
      entityId: draft.id,
      branchId: draft.branchId,
      summary: "Draft cancelled",
    });
    res.json(updated);
  },
);

router.post(
  "/drafts/:id/convert",
  requireRole("ADMIN", "MANAGER", "CASHIER"),
  requirePermission("purchases"),
  async (req, res) => {
    const draft = await prisma.purchaseDraft.findFirst({
      where: {
        id: String(req.params.id),
        organizationId: req.user.organizationId,
      },
      include: {
        items: {
          include: { product: { select: { id: true, cost: true } } },
        },
      },
    });
    if (!draft) return sendError(res, 404, "مسودة غير موجودة", "Draft not found");
    await assertBranchAccess(req, draft.branchId);
    if (draft.status !== "OPEN") {
      return sendError(res, 400, "المسودة ليست مفتوحة", "Draft is not open");
    }
    if (!draft.items.length) {
      return sendError(res, 400, "المسودة فارغة", "Draft has no lines");
    }

    const overrides = Array.isArray(req.body?.items) ? req.body.items : null;
    let receiveItems;
    if (overrides?.length) {
      receiveItems = overrides.map((l) => ({
        productId: String(l.productId),
        quantity: Math.max(1, Math.floor(Number(l.quantity) || 1)),
        unitCost:
          l?.unitCost != null && l.unitCost !== "" ? Number(l.unitCost) : null,
        expiryDate: l.expiryDate ?? null,
      }));
    } else {
      receiveItems = draft.items.map((l) => {
        let unitCost = l.unitCost != null ? Number(l.unitCost) : null;
        if (unitCost == null && l.product?.cost != null) {
          unitCost = Number(l.product.cost);
        }
        return {
          productId: l.productId,
          quantity: l.quantity,
          unitCost,
          expiryDate: null,
        };
      });
    }

    const missingCost = receiveItems.find(
      (line) => line.unitCost == null || !Number.isFinite(line.unitCost) || line.unitCost < 0,
    );
    if (missingCost) {
      return sendError(
        res,
        400,
        "حدد تكلفة وحدة صالحة لكل بند قبل التحويل",
        "Set a valid unit cost on every line before converting",
      );
    }

    try {
      const { purchase } = await executeReceivePurchase({
        orgId: req.user.organizationId,
        userId: req.user.sub,
        userRole: req.user.role,
        userBranchId: req.user.branchId,
        branchId: draft.branchId,
        supplierId: req.body?.supplierId ?? draft.supplierId,
        note:
          req.body?.note != null
            ? String(req.body.note)
            : draft.note || `من مسودة إعادة الطلب ${draft.id.slice(0, 8)}`,
        items: receiveItems,
        updateProductCost: Boolean(req.body?.updateProductCost ?? true),
      });

      const updated = await prisma.purchaseDraft.update({
        where: { id: draft.id },
        data: { status: "CONVERTED", purchaseId: purchase.id },
        include: draftInclude(),
      });

      await writeAudit({
        userId: req.user.sub,
        action: "PURCHASE_DRAFT_CONVERT",
        entityType: "PurchaseDraft",
        entityId: draft.id,
        branchId: draft.branchId,
        summary: `Converted to purchase ${purchase.id}`,
      });

      res.status(201).json({ draft: updated, purchase });
    } catch (e) {
      const status = e?.status || 400;
      return sendError(
        res,
        status,
        e instanceof Error ? e.message : "فشل تحويل المسودة",
        e?.errorEn || (e instanceof Error ? e.message : "Failed to convert draft"),
      );
    }
  },
);

export default router;
