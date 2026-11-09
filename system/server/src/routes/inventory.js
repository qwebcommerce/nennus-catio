import { Router } from "express";
import { Prisma } from "../lib/prisma-client-bundle.js";
import { prisma } from "../lib/prisma.js";
import { findBranchInOrg } from "../lib/orgScope.js";
import { authMiddleware, requireRole, requirePermission } from "../middleware/auth.js";
import { writeAudit } from "../lib/auditLog.js";
import { scheduleInventoryWebhook } from "../lib/inventoryWebhook.js";
import { resolveStoredImageUrl } from "../lib/productImageUrl.js";
import { calendarDaysUntilExpiryUTC } from "../lib/productExpiry.js";
import {
  moveLotsBetweenBranches,
  syncLotsToTargetQuantity,
} from "../lib/inventoryLots.js";
import { executeInventoryTransfer } from "../lib/inventoryTransfer.js";
import {
  dbUnavailableMessage,
  dbUnavailableMessageEn,
  isDbUnavailableError,
} from "../lib/dbErrors.js";

const router = Router();
router.use(authMiddleware);

/** Browse inventory lots across products — ?branchId=&q=&inStock=1&withinDays= */
router.get("/lots", requirePermission("productsView"), async (req, res) => {
  try {
    const orgId = req.user.organizationId;
    const branchIdRaw =
      req.query.branchId != null && String(req.query.branchId).trim()
        ? String(req.query.branchId).trim()
        : null;
    // Admins may omit branchId to browse all branches; others default to their branch.
    const branchId =
      branchIdRaw ||
      (req.user.role === "ADMIN" ? null : req.user.branchId || null);
    if (
      req.user.role !== "ADMIN" &&
      req.user.branchId &&
      branchId &&
      req.user.branchId !== branchId
    ) {
      return res.status(403).json({ error: "غير مصرح لهذا الفرع" });
    }
    const q = req.query.q != null ? String(req.query.q).trim() : "";
    const productId =
      req.query.productId != null && String(req.query.productId).trim()
        ? String(req.query.productId).trim()
        : "";
    const inStockOnly = String(req.query.inStock ?? "1") !== "0";
    const withinRaw = Number.parseInt(String(req.query.withinDays ?? ""), 10);
    const withinDays = Number.isFinite(withinRaw)
      ? Math.max(0, Math.min(365, withinRaw))
      : null;

    const where = {
      organizationId: orgId,
      ...(branchId ? { branchId } : {}),
      ...(productId ? { productId } : {}),
      ...(inStockOnly ? { quantityOnHand: { gt: 0 } } : {}),
      ...(q
        ? {
            product: {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { nameEn: { contains: q, mode: "insensitive" } },
                { sku: { contains: q, mode: "insensitive" } },
                { barcode: { contains: q, mode: "insensitive" } },
              ],
            },
          }
        : {}),
    };

    if (withinDays != null) {
      const now = new Date();
      const end = new Date(now);
      end.setUTCDate(end.getUTCDate() + withinDays);
      where.expiryDate = { not: null, lte: end };
    }

    const lots = await prisma.inventoryLot.findMany({
      where,
      include: {
        product: {
          select: {
            id: true,
            name: true,
            nameEn: true,
            sku: true,
            barcode: true,
            imageUrl: true,
            isActive: true,
          },
        },
        branch: { select: { id: true, name: true, nameEn: true } },
      },
      orderBy: [{ expiryDate: "asc" }, { receivedAt: "asc" }],
      take: 500,
    });

    const mapped = lots.map((lot) => ({
      ...lot,
      product: lot.product
        ? {
            ...lot.product,
            imageUrl: resolveStoredImageUrl(lot.product.imageUrl),
          }
        : lot.product,
      daysUntilExpiry: lot.expiryDate
        ? calendarDaysUntilExpiryUTC(lot.expiryDate)
        : null,
    }));

    res.json({ lots: mapped });
  } catch (e) {
    if (isDbUnavailableError(e)) {
      return res.status(503).json({
        error: dbUnavailableMessage,
        errorAr: dbUnavailableMessage,
        errorEn: dbUnavailableMessageEn,
        code: "DB_UNAVAILABLE",
      });
    }
    const msg = e instanceof Error ? e.message : "فشل تحميل الدفعات";
    res.status(400).json({ error: msg });
  }
});

/** منتجات/دفعات منتهية أو قرب انتهاء الصلاحية — ?withinDays=30 (افتراضي) */
router.get("/expiry-alerts", async (req, res) => {
  try {
    const branchId =
      req.query.branchId != null && String(req.query.branchId).trim()
        ? String(req.query.branchId).trim()
        : req.user.branchId || null;
    const orgId = req.user.organizationId;
    const withinRaw = Number.parseInt(String(req.query.withinDays ?? "30"), 10);
    const withinDays = Number.isFinite(withinRaw) ? Math.max(0, Math.min(365, withinRaw)) : 30;

    const out = [];
    const seenKeys = new Set();

    const lotWhere = {
      organizationId: orgId,
      quantityOnHand: { gt: 0 },
      expiryDate: { not: null },
      ...(branchId ? { branchId } : {}),
    };
    const lots = await prisma.inventoryLot.findMany({
      where: lotWhere,
      include: {
        product: { select: { id: true, name: true, nameEn: true, sku: true, imageUrl: true, isActive: true } },
        branch: { select: { id: true, name: true, nameEn: true } },
      },
      orderBy: { expiryDate: "asc" },
      take: 500,
    });

    for (const lot of lots) {
      if (!lot.product?.isActive) continue;
      const days = calendarDaysUntilExpiryUTC(lot.expiryDate);
      if (days === null || days > withinDays) continue;
      const status = days < 0 ? "expired" : days === 0 ? "today" : "soon";
      const key = `lot:${lot.id}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      out.push({
        source: "lot",
        lotId: lot.id,
        product: {
          ...lot.product,
          imageUrl: resolveStoredImageUrl(lot.product.imageUrl),
        },
        branchId: lot.branchId,
        branchName: lot.branch?.name || null,
        quantityOnHand: Number(lot.quantityOnHand),
        expiryDate: lot.expiryDate,
        daysUntilExpiry: days,
        status,
      });
    }

    const products = await prisma.product.findMany({
      where: {
        organizationId: orgId,
        isActive: true,
        expiryDate: { not: null },
      },
      include: branchId
        ? { inventories: { where: { branchId } } }
        : { inventories: true },
      orderBy: { expiryDate: "asc" },
    });

    for (const p of products) {
      const days = calendarDaysUntilExpiryUTC(p.expiryDate);
      if (days === null || days > withinDays) continue;
      const key = `product:${p.id}`;
      if (seenKeys.has(`lot-product:${p.id}`) || out.some((r) => r.product?.id === p.id && r.source === "lot")) {
        // Prefer lot-level rows when present for same product
        continue;
      }
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      const status = days < 0 ? "expired" : days === 0 ? "today" : "soon";
      out.push({
        source: "product",
        product: {
          ...p,
          imageUrl: resolveStoredImageUrl(p.imageUrl),
        },
        daysUntilExpiry: days,
        status,
      });
    }

    out.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
    res.json(out);
  } catch (e) {
    console.error("[expiry-alerts]", e);
    res.status(500).json({ error: "تعذر جلب تنبيهات الصلاحية" });
  }
});

router.get("/low-stock", async (req, res) => {
  const branchId = req.query.branchId || req.user.branchId;
  const orgId = req.user.organizationId;
  const rows = await prisma.inventory.findMany({
    where: branchId
      ? {
          branchId: String(branchId),
          branch: { organizationId: orgId },
          product: { organizationId: orgId },
        }
      : {
          branch: { organizationId: orgId },
          product: { organizationId: orgId },
        },
    include: { product: true, branch: true },
  });
  const low = rows.filter((r) => r.quantity <= r.minStockLevel);
  res.json(low);
});

router.post("/reconcile", requireRole("ADMIN", "MANAGER", "CASHIER"), requirePermission("stockCount"), async (req, res) => {
  const { branchId, lines } = req.body || {};
  const bid = branchId || req.user.branchId;
  if (!bid) return res.status(400).json({ error: "يجب اختيار الفرع" });
  if (!Array.isArray(lines) || !lines.length) {
    return res.status(400).json({ error: "لا توجد بنود" });
  }
  if (req.user.role !== "ADMIN" && req.user.branchId && req.user.branchId !== bid) {
    return res.status(403).json({ error: "لا يمكن الجرد لفرع آخر" });
  }
  const orgId = req.user.organizationId;
  const br = await findBranchInOrg(prisma, orgId, bid);
  if (!br) return res.status(400).json({ error: "فرع غير صالح" });

  // Only apply lines that change quantity (full catalog posts are common from the UI).
  const normalized = [];
  for (const line of lines) {
    const productId = String(line.productId || "");
    if (!productId) continue;
    const q = Math.max(0, Math.floor(Number(line.quantity) || 0));
    const pr = await prisma.product.findFirst({
      where: { id: productId, organizationId: orgId },
    });
    if (!pr) return res.status(400).json({ error: `منتج غير صالح: ${productId}` });
    normalized.push({ productId, quantity: q });
  }
  if (!normalized.length) {
    return res.status(400).json({ error: "لا توجد بنود" });
  }

  try {
    await prisma.$transaction(async (tx) => {
      for (const line of normalized) {
        await tx.inventory.upsert({
          where: {
            productId_branchId: { productId: line.productId, branchId: bid },
          },
          create: {
            productId: line.productId,
            branchId: bid,
            quantity: line.quantity,
            minStockLevel: 5,
          },
          update: { quantity: line.quantity },
        });
        await syncLotsToTargetQuantity(tx, {
          orgId,
          branchId: bid,
          productId: line.productId,
          targetQty: line.quantity,
        });
      }
    });
    await writeAudit({
      userId: req.user.sub,
      action: "INVENTORY_RECONCILE",
      entityType: "Inventory",
      entityId: bid,
      branchId: bid,
      summary: `Reconcile ${normalized.length} lines`,
    });
    scheduleInventoryWebhook(orgId, {
      event: "inventory.reconcile",
      meta: { branchId: bid, lineCount: normalized.length },
      lines: normalized.map((line) => ({
        branchId: bid,
        productId: line.productId,
        quantityDelta: 0,
      })),
    });
    res.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "فشل الجرد";
    res.status(400).json({ error: msg });
  }
});

router.post("/transfer", requireRole("ADMIN", "MANAGER", "CASHIER"), requirePermission("transfer"), async (req, res) => {
  const { fromBranchId, toBranchId, items } = req.body || {};
  const from = String(fromBranchId || "");
  const to = String(toBranchId || "");
  if (req.user.role !== "ADMIN" && req.user.branchId && req.user.branchId !== from) {
    return res.status(403).json({ error: "لا يمكن التحويل من فرع آخر" });
  }
  const orgId = req.user.organizationId;
  const bFrom = await findBranchInOrg(prisma, orgId, from);
  const bTo = await findBranchInOrg(prisma, orgId, to);
  if (!bFrom || !bTo) return res.status(400).json({ error: "فرع غير صالح" });

  try {
    const result = await executeInventoryTransfer({
      orgId,
      userId: req.user.sub,
      fromBranchId: from,
      toBranchId: to,
      items: Array.isArray(items) ? items : [],
    });
    res.json(result);
  } catch (e) {
    const status = e?.status || 400;
    const msg = e?.errorAr || (e instanceof Error ? e.message : "فشل التحويل");
    res.status(status).json({
      error: msg,
      errorAr: e?.errorAr || msg,
      errorEn: e?.errorEn || msg,
    });
  }
});

/** تعديل مخزون مع idempotency للمزامنة بعد العمل دون اتصال */
router.post("/offline-upsert", requireRole("ADMIN", "MANAGER"), async (req, res) => {
  const {
    clientMutationId: cmRaw,
    productId,
    branchId,
    quantity,
    minStockLevel,
    deviceId: _deviceId,
  } = req.body || {};
  const cmid = cmRaw != null && String(cmRaw).trim() ? String(cmRaw).trim() : null;
  if (!cmid) return res.status(400).json({ error: "clientMutationId مطلوب" });
  if (!productId || !branchId) {
    return res.status(400).json({ error: "productId و branchId مطلوبان" });
  }
  const bid = String(branchId);
  if (req.user.role !== "ADMIN" && req.user.branchId && req.user.branchId !== bid) {
    return res.status(403).json({ error: "لا يمكن التعديل لفروع أخرى" });
  }

  const cached = await prisma.offlineInventoryReceipt.findFirst({
    where: { clientMutationId: cmid, organizationId: req.user.organizationId },
  });
  if (cached) {
    return res.status(200).json(cached.payload);
  }

  const br = await findBranchInOrg(prisma, req.user.organizationId, bid);
  if (!br) return res.status(400).json({ error: "فرع غير صالح" });
  const prodOk = await prisma.product.findFirst({
    where: { id: String(productId), organizationId: req.user.organizationId },
  });
  if (!prodOk) return res.status(400).json({ error: "منتج غير صالح" });

  try {
    const inv = await prisma.inventory.upsert({
      where: {
        productId_branchId: {
          productId: String(productId),
          branchId: bid,
        },
      },
      create: {
        productId: String(productId),
        branchId: bid,
        quantity: Math.max(0, Number(quantity) || 0),
        minStockLevel: Math.max(0, Number(minStockLevel) || 5),
      },
      update: {
        ...(quantity != null && { quantity: Math.max(0, Number(quantity)) }),
        ...(minStockLevel != null && {
          minStockLevel: Math.max(0, Number(minStockLevel)),
        }),
      },
      include: { product: true, branch: true },
    });
    const payload = JSON.parse(JSON.stringify(inv));
    try {
      await prisma.offlineInventoryReceipt.create({
        data: {
          clientMutationId: cmid,
          organizationId: req.user.organizationId,
          payload,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const again = await prisma.offlineInventoryReceipt.findFirst({
          where: { clientMutationId: cmid, organizationId: req.user.organizationId },
        });
        if (again) return res.status(200).json(again.payload);
      }
      throw e;
    }
    scheduleInventoryWebhook(req.user.organizationId, {
      event: "inventory.offline_upsert",
      meta: { branchId: bid, productId: String(productId) },
      lines: [
        {
          branchId: bid,
          productId: String(productId),
          quantityDelta: 0,
        },
      ],
    });
    res.status(201).json(payload);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "فشل التحديث";
    res.status(400).json({ error: msg });
  }
});

router.patch("/:productId/:branchId", requireRole("ADMIN", "MANAGER"), async (req, res) => {
  const { quantity, minStockLevel } = req.body || {};
  const orgId = req.user.organizationId;
  const br = await findBranchInOrg(prisma, orgId, req.params.branchId);
  if (!br) return res.status(404).json({ error: "غير موجود" });
  const pr = await prisma.product.findFirst({
    where: { id: req.params.productId, organizationId: orgId },
  });
  if (!pr) return res.status(404).json({ error: "غير موجود" });
  const inv = await prisma.inventory.upsert({
    where: {
      productId_branchId: {
        productId: req.params.productId,
        branchId: req.params.branchId,
      },
    },
    create: {
      productId: req.params.productId,
      branchId: req.params.branchId,
      quantity: Math.max(0, Number(quantity) || 0),
      minStockLevel: Math.max(0, Number(minStockLevel) || 5),
    },
    update: {
      ...(quantity != null && { quantity: Math.max(0, Number(quantity)) }),
      ...(minStockLevel != null && {
        minStockLevel: Math.max(0, Number(minStockLevel)),
      }),
    },
    include: { product: true, branch: true },
  });
  scheduleInventoryWebhook(orgId, {
    event: "inventory.patch",
    meta: {
      branchId: req.params.branchId,
      productId: req.params.productId,
    },
    lines: [
      {
        branchId: req.params.branchId,
        productId: req.params.productId,
        quantityDelta: 0,
      },
    ],
  });
  res.json(inv);
});

export default router;
