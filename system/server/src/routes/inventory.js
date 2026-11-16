import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { findBranchInOrg } from "../lib/orgScope.js";
import { authMiddleware, requireModule } from "../middleware/auth.js";
import { writeAudit } from "../lib/auditLog.js";
import { executeInventoryTransfer } from "../lib/inventoryTransfer.js";
import { lockStockRow, setStockCount } from "../lib/stockLedger.js";
import { listLowStock } from "../lib/lowStock.js";

const router = Router();
router.use(authMiddleware);
router.use(requireModule("warehouses", "view"));

router.get("/low-stock", async (req, res) => {
  const branchId = req.query.branchId || req.user.branchId;
  res.json(await listLowStock(prisma, req.user.organizationId, branchId || null));
});

router.post("/reconcile", requireModule("warehouses", "edit"), async (req, res) => {
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

  // Only lines that change quantity write a movement (full catalogue posts are common from the UI).
  const normalized = [];
  for (const line of lines) {
    const productId = String(line.productId || "");
    if (!productId) continue;
    const q = Number(line.quantity);
    if (!Number.isInteger(q) || q < 0) {
      return res.status(400).json({
        error: "الكمية المعدودة يجب أن تكون عدداً صحيحاً",
        errorAr: "الكمية المعدودة يجب أن تكون عدداً صحيحاً",
        errorEn: "A counted quantity must be a whole number of zero or more",
      });
    }
    const pr = await prisma.product.findFirst({
      where: { id: productId, organizationId: orgId },
      include: { variants: { select: { id: true } } },
    });
    if (!pr) return res.status(400).json({ error: `منتج غير صالح: ${productId}` });
    const variantId = line.variantId ? String(line.variantId) : null;
    if (variantId && !pr.variants.some((v) => v.id === variantId)) {
      return res.status(400).json({ error: `الحجم غير تابع للمنتج: ${pr.name}`, errorEn: `Variant is not on ${pr.name}` });
    }
    // A product with variants keeps its stock per variant; a product-level count would start a second stock.
    if (!variantId && pr.variants.length) continue;
    normalized.push({ productId, variantId, quantity: q });
  }
  if (!normalized.length) {
    return res.status(400).json({ error: "لا توجد بنود" });
  }
  const note = String(req.body?.reason || req.body?.note || "Stock count").trim().slice(0, 300) || "Stock count";

  try {
    const changes = await prisma.$transaction(
      async (tx) => {
        const out = [];
        for (const line of normalized) {
          const r = await setStockCount(tx, {
            orgId,
            userId: req.user.sub,
            productId: line.productId,
            variantId: line.variantId,
            branchId: bid,
            quantity: line.quantity,
            note,
          });
          if (r.delta) out.push({ ...line, before: r.before, delta: r.delta });
        }
        return out;
      },
      { maxWait: 15000, timeout: 60000 },
    );
    await writeAudit({
      userId: req.user.sub,
      action: "INVENTORY_RECONCILE",
      entityType: "Inventory",
      entityId: bid,
      branchId: bid,
      summary: `Stock count: ${changes.length} of ${normalized.length} lines changed`,
      meta: { reason: note, changes: changes.slice(0, 100) },
    });
    res.json({ ok: true, changed: changes.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "فشل الجرد";
    res.status(e?.status || 400).json({ error: msg, ...(e?.errorEn ? { errorAr: e.errorAr, errorEn: e.errorEn } : {}) });
  }
});

router.post("/transfer", requireModule("warehouses", "edit"), async (req, res) => {
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

/**
 * Staff adjustment (FR-17) and low-stock level (FR-92) for one balance.
 * Body: { quantity? (counted number) | delta? (+/-), reason (required when stock changes), minStockLevel?, variantId? }
 * A stock change writes an ADJUSTMENT movement and an audit row; it never overwrites stock silently.
 */
async function adjustBalance(req, res, { productId, variantId, branchId }) {
  const { quantity, delta, minStockLevel } = req.body || {};
  const reason = String(req.body?.reason ?? "").trim().slice(0, 300);
  const orgId = req.user.organizationId;
  const br = await findBranchInOrg(prisma, orgId, branchId);
  if (!br) return res.status(404).json({ error: "غير موجود" });
  const pr = await prisma.product.findFirst({
    where: { id: productId, organizationId: orgId },
    include: { variants: { select: { id: true } } },
  });
  if (!pr) return res.status(404).json({ error: "غير موجود" });
  if (variantId && !pr.variants.some((v) => v.id === variantId)) {
    return res.status(404).json({ error: "غير موجود" });
  }

  let level = null;
  if (minStockLevel != null && minStockLevel !== "") {
    level = Number(minStockLevel);
    if (!Number.isInteger(level) || level < 0) {
      return res.status(400).json({
        error: "حد المخزون المنخفض يجب أن يكون عدداً صحيحاً",
        errorAr: "حد المخزون المنخفض يجب أن يكون عدداً صحيحاً",
        errorEn: "The low-stock level must be a whole number of zero or more",
      });
    }
  }
  const wantsQty = quantity != null && quantity !== "";
  const wantsDelta = delta != null && delta !== "" && Number(delta) !== 0;
  if ((wantsQty || wantsDelta) && !variantId && pr.variants.length) {
    return res.status(400).json({
      error: "اختر الحجم — مخزون هذا المنتج لكل حجم",
      errorAr: "اختر الحجم — مخزون هذا المنتج لكل حجم",
      errorEn: "This product keeps stock per variant. Choose the variant.",
    });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      let change = null;
      if (wantsQty || wantsDelta) {
        const row = await lockStockRow(tx, { productId, variantId, branchId });
        const target = wantsQty ? Number(quantity) : Number(row.quantity) + Number(delta);
        if (wantsDelta && !Number.isInteger(Number(delta))) {
          const err = new Error("الكمية يجب أن تكون عدداً صحيحاً");
          err.status = 400;
          err.errorAr = err.message;
          err.errorEn = "The change must be a whole number";
          throw err;
        }
        if (target !== Number(row.quantity) && !reason) {
          const err = new Error("اذكر سبب تعديل المخزون");
          err.status = 400;
          err.errorAr = err.message;
          err.errorEn = "Give a reason for the stock adjustment";
          err.code = "ADJUSTMENT_REASON_REQUIRED";
          throw err;
        }
        change = await setStockCount(tx, {
          orgId,
          userId: req.user.sub,
          productId,
          variantId,
          branchId,
          quantity: target,
          note: reason,
        });
      } else {
        await lockStockRow(tx, { productId, variantId, branchId });
      }
      if (level != null) {
        if (variantId) {
          await tx.variantStock.update({
            where: { variantId_branchId: { variantId, branchId } },
            data: { minStockLevel: level },
          });
        } else {
          await tx.inventory.update({
            where: { productId_branchId: { productId, branchId } },
            data: { minStockLevel: level },
          });
        }
      }
      const row = variantId
        ? await tx.variantStock.findUnique({
            where: { variantId_branchId: { variantId, branchId } },
            include: { branch: true, variant: true },
          })
        : await tx.inventory.findUnique({
            where: { productId_branchId: { productId, branchId } },
            include: { product: true, branch: true },
          });
      return { row, change };
    });
    if (result.change?.delta) {
      await writeAudit({
        userId: req.user.sub,
        action: "STOCK_ADJUSTMENT",
        entityType: variantId ? "VariantStock" : "Inventory",
        entityId: result.row.id,
        branchId,
        summary: `Adjust ${pr.nameEn || pr.name}${variantId ? ` (${result.row.variant?.labelEn || result.row.variant?.label || variantId})` : ""}: ${result.change.before} -> ${result.change.after} (${result.change.delta > 0 ? "+" : ""}${result.change.delta}). Reason: ${reason}`,
        meta: { productId, variantId, before: result.change.before, after: result.change.after, delta: result.change.delta, reason },
      });
    }
    if (level != null) {
      await writeAudit({
        userId: req.user.sub,
        action: "LOW_STOCK_LEVEL",
        entityType: variantId ? "VariantStock" : "Inventory",
        entityId: result.row.id,
        branchId,
        summary: `Low-stock level ${level}`,
        meta: { productId, variantId, minStockLevel: level },
      });
    }
    res.json({ ...result.row, adjustment: result.change });
  } catch (e) {
    res.status(e?.status || 400).json({
      error: e instanceof Error ? e.message : "فشل التعديل",
      ...(e?.errorEn ? { errorAr: e.errorAr, errorEn: e.errorEn } : {}),
      ...(typeof e?.code === "string" && !e.code.startsWith("P") ? { code: e.code } : {}),
    });
  }
}

router.patch("/variants/:variantId/:branchId", requireModule("warehouses", "edit"), async (req, res) => {
  const variant = await prisma.productVariant.findFirst({
    where: { id: req.params.variantId, organizationId: req.user.organizationId },
    select: { id: true, productId: true },
  });
  if (!variant) return res.status(404).json({ error: "غير موجود" });
  return adjustBalance(req, res, { productId: variant.productId, variantId: variant.id, branchId: req.params.branchId });
});

router.patch("/:productId/:branchId", requireModule("warehouses", "edit"), async (req, res) => {
  const variantId = req.body?.variantId ? String(req.body.variantId) : null;
  return adjustBalance(req, res, { productId: req.params.productId, variantId, branchId: req.params.branchId });
});

export default router;
