import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { findBranchInOrg } from "../lib/orgScope.js";
import { authMiddleware, requireModule } from "../middleware/auth.js";
import { writeAudit } from "../lib/auditLog.js";
import { executeInventoryTransfer } from "../lib/inventoryTransfer.js";

const router = Router();
router.use(authMiddleware);
router.use(requireModule("warehouses", "view"));

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
    res.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "فشل الجرد";
    res.status(400).json({ error: msg });
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

router.patch("/:productId/:branchId", requireModule("warehouses", "edit"), async (req, res) => {
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
  res.json(inv);
});

export default router;
