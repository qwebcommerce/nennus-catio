import { Router } from "express";
import { Prisma } from "../lib/prisma-client-bundle.js";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";
import { writeAudit } from "../lib/auditLog.js";
import { unitPriceDecimalForSale } from "../lib/productPricing.js";
import { resolveLineModifiers } from "../lib/productModifiers.js";

const router = Router();
router.use(authMiddleware);

const MAX_HELD_PER_USER_BRANCH = 15;

async function normalizeCartPayload(db, organizationId, branchId, rawItems, useWholesale = false) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new Error("السلة فارغة");
  }
  const out = [];
  for (const line of rawItems) {
    const productId = line?.productId;
    if (!productId) continue;
    const product = await db.product.findFirst({
      where: { id: String(productId), organizationId },
      include: { inventories: { where: { branchId: String(branchId) } } },
    });
    if (!product) continue;
    const inv = product.inventories[0];
    const stock = inv?.quantity ?? 0;
    const want = Math.max(1, Math.floor(Number(line.quantity) || 1));
    const qty = Math.min(want, stock);
    if (qty < 1) continue;
    const { selected, delta } = resolveLineModifiers(
      product,
      line.modifiers || line.modifierKeys
    );
    const base = Number(unitPriceDecimalForSale(product, useWholesale));
    const unitPrice = Math.round((base + delta) * 100) / 100;
    out.push({
      productId: product.id,
      name: product.name,
      nameEn: product.nameEn,
      imageUrl: product.imageUrl,
      unitPrice,
      quantity: qty,
      maxStock: stock,
      modifiers: selected.length ? selected : undefined,
      lineKey: selected.length
        ? `${product.id}::${selected.map((m) => m.key).sort().join(",")}`
        : product.id,
    });
  }
  if (!out.length) throw new Error("لا توجد أصناف صالحة أو المخزون غير كافٍ");
  const subtotal = out.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  return { items: out, subtotal };
}

router.get("/", async (req, res) => {
  const qBranch = req.query.branchId;
  const bid = qBranch || req.user.branchId;
  if (!bid) return res.json([]);
  if (req.user.role !== "ADMIN" && req.user.branchId && req.user.branchId !== String(bid)) {
    return res.status(403).json({ error: "غير مصرح" });
  }
  const where = {
    branchId: String(bid),
    branch: { organizationId: req.user.organizationId },
  };
  if (req.user.role === "ASSOCIATE") {
    where.userId = req.user.sub;
  }
  const rows = await prisma.heldCart.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { user: { select: { id: true, name: true, nameEn: true, role: true } } },
  });
  res.json(rows);
});

router.post("/", async (req, res) => {
  const {
    branchId: bodyBranch,
    label,
    items: rawItems,
    customerId,
    discountInput,
    taxPercent,
    useWholesalePricing: useWholesaleRaw,
    paymentMethod: paymentMethodRaw,
    deliveryAddress: deliveryAddressRaw,
    guestPhone: guestPhoneRaw,
    tableNumber: tableNumberRaw,
    orderNote: orderNoteRaw,
  } = req.body || {};
  const useWholesalePricing = Boolean(useWholesaleRaw);
  const bid = bodyBranch || req.user.branchId;
  if (!bid) return res.status(400).json({ error: "يجب اختيار الفرع" });
  if (req.user.role !== "ADMIN" && req.user.branchId && req.user.branchId !== String(bid)) {
    return res.status(403).json({ error: "لا يمكن التعليق لفرع آخر" });
  }

  try {
    const existing = await prisma.heldCart.count({
      where: { branchId: String(bid), userId: req.user.sub },
    });
    if (existing >= MAX_HELD_PER_USER_BRANCH) {
      return res.status(400).json({
        error: `الحد الأقصى ${MAX_HELD_PER_USER_BRANCH} فواتير معلّقة لكل مستخدم في الفرع`,
      });
    }

    const { items, subtotal } = await normalizeCartPayload(
      prisma,
      req.user.organizationId,
      bid,
      rawItems,
      useWholesalePricing
    );
    const payload = {
      items,
      useWholesalePricing,
      customerId:
        customerId != null && String(customerId).trim() ? String(customerId).trim() : "",
      discountInput: discountInput != null ? String(discountInput) : "",
      taxPercent: taxPercent != null ? String(taxPercent) : "0",
      paymentMethod:
        paymentMethodRaw != null && String(paymentMethodRaw).trim()
          ? String(paymentMethodRaw).trim().toUpperCase().slice(0, 20)
          : "",
      deliveryAddress:
        deliveryAddressRaw != null && String(deliveryAddressRaw).trim()
          ? String(deliveryAddressRaw).trim().slice(0, 500)
          : "",
      guestPhone:
        guestPhoneRaw != null && String(guestPhoneRaw).trim()
          ? String(guestPhoneRaw).trim().slice(0, 40)
          : "",
      tableNumber:
        tableNumberRaw != null && String(tableNumberRaw).trim()
          ? String(tableNumberRaw).trim().slice(0, 40)
          : "",
      orderNote:
        orderNoteRaw != null && String(orderNoteRaw).trim()
          ? String(orderNoteRaw).trim().slice(0, 500)
          : "",
    };
    const created = await prisma.heldCart.create({
      data: {
        branchId: String(bid),
        userId: req.user.sub,
        label: label != null && String(label).trim() ? String(label).trim().slice(0, 80) : null,
        payload,
        lineCount: items.length,
        subtotal: new Prisma.Decimal(subtotal.toFixed(2)),
      },
      include: { user: { select: { id: true, name: true, nameEn: true, role: true } } },
    });

    await writeAudit({
      userId: req.user.sub,
      action: "HELD_CART_CREATE",
      entityType: "HeldCart",
      entityId: created.id,
      branchId: String(bid),
      summary: `Held ${created.lineCount} lines`,
    });

    res.status(201).json(created);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "فشل تعليق السلة";
    res.status(400).json({ error: msg });
  }
});

router.delete("/:id", async (req, res) => {
  const row = await prisma.heldCart.findFirst({
    where: {
      id: req.params.id,
      branch: { organizationId: req.user.organizationId },
    },
  });
  if (!row) return res.status(404).json({ error: "غير موجود" });
  if (req.user.role !== "ADMIN" && req.user.branchId && req.user.branchId !== row.branchId) {
    return res.status(403).json({ error: "غير مصرح" });
  }
  const canDelete =
    row.userId === req.user.sub ||
    req.user.role === "ADMIN" ||
    req.user.role === "MANAGER" ||
    req.user.role === "CASHIER";
  if (!canDelete) {
    return res.status(403).json({ error: "يمكنك حذف تعليقاتك فقط" });
  }
  await prisma.heldCart.delete({ where: { id: row.id } });
  await writeAudit({
    userId: req.user.sub,
    action: "HELD_CART_DELETE",
    entityType: "HeldCart",
    entityId: row.id,
    branchId: row.branchId,
    summary: "Deleted held cart",
  });
  res.status(204).end();
});

export default router;
