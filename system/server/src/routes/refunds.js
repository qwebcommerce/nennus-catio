import { Router } from "express";
import { Prisma } from "../lib/prisma-client-bundle.js";
import { prisma } from "../lib/prisma.js";
import { findBranchInOrg } from "../lib/orgScope.js";
import { authMiddleware, requireRole, requirePermission } from "../middleware/auth.js";
import { writeAudit } from "../lib/auditLog.js";
import { scheduleInventoryWebhook } from "../lib/inventoryWebhook.js";
import { assessRefundRisk } from "../lib/cashierCopilot.js";
import { sendError } from "../lib/apiError.js";

const router = Router();
router.use(authMiddleware);

router.get("/", async (req, res) => {
  const { branchId, limit = "50" } = req.query;
  const where = { branch: { organizationId: req.user.organizationId } };
  const bid = branchId || (req.user.role === "ADMIN" ? undefined : req.user.branchId);
  if (bid) where.branchId = String(bid);
  const rows = await prisma.refund.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: Math.min(200, Math.max(1, parseInt(String(limit), 10) || 50)),
    include: {
      items: { include: { product: { select: { id: true, name: true, sku: true } } } },
      branch: { select: { name: true } },
      user: { select: { name: true } },
      sale: { select: { id: true, total: true, createdAt: true, invoiceNumber: true } },
    },
  });
  res.json(rows);
});

const refundInclude = {
  items: { include: { product: true } },
  branch: true,
  sale: true,
  user: { select: { name: true } },
};

router.post("/", requireRole("ADMIN", "MANAGER", "CASHIER"), requirePermission("refunds"), async (req, res) => {
  const {
    branchId,
    saleId,
    note,
    items,
    clientMutationId: clientMutationIdRaw,
    deviceId: _deviceId,
  } = req.body || {};
  const bid = branchId || req.user.branchId;
  if (!bid) return res.status(400).json({ error: "يجب اختيار الفرع" });
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "لا توجد أصناف للإرجاع" });
  }
  if (req.user.role !== "ADMIN" && req.user.branchId && req.user.branchId !== bid) {
    return res.status(403).json({ error: "لا يمكن الإرجاع لفرع آخر" });
  }
  const orgId = req.user.organizationId;
  const branchOk = await findBranchInOrg(prisma, orgId, bid);
  if (!branchOk) return res.status(400).json({ error: "فرع غير صالح" });

  const clientMutationId =
    clientMutationIdRaw != null && String(clientMutationIdRaw).trim()
      ? String(clientMutationIdRaw).trim()
      : null;

  if (clientMutationId) {
    const existing = await prisma.refund.findFirst({
      where: {
        clientMutationId,
        branch: { organizationId: orgId },
      },
      include: refundInclude,
    });
    if (existing) {
      if (existing.branchId !== bid || existing.userId !== req.user.sub) {
        return res.status(409).json({ error: "تعارض معرف المزامنة" });
      }
      return res.status(200).json(existing);
    }
  }

  let saleRef = null;
  let saleItemsByProduct = null;
  if (saleId != null && String(saleId).trim()) {
    saleRef = await prisma.sale.findFirst({
      where: { id: String(saleId), branch: { organizationId: orgId } },
      include: {
        items: {
          include: {
            lotUsages: {
              select: { inventoryLotId: true, quantity: true },
            },
          },
        },
      },
    });
    if (!saleRef) return res.status(400).json({ error: "فاتورة غير موجودة" });
    if (saleRef.branchId !== bid) return res.status(400).json({ error: "الفاتورة من فرع آخر" });

    const priorRefunds = await prisma.refund.findMany({
      where: { saleId: saleRef.id, branch: { organizationId: orgId } },
      include: { items: true },
    });
    const alreadyRefunded = new Map();
    for (const r of priorRefunds) {
      for (const it of r.items) {
        alreadyRefunded.set(
          it.productId,
          (alreadyRefunded.get(it.productId) || 0) + Number(it.quantity || 0),
        );
      }
    }

    saleItemsByProduct = new Map();
    for (const it of saleRef.items) {
      const prev = saleItemsByProduct.get(it.productId) || {
        quantity: 0,
        unitPrice: it.unitPrice,
        lotUsages: [],
      };
      prev.quantity += Number(it.quantity || 0);
      prev.lotUsages.push(...(it.lotUsages || []));
      saleItemsByProduct.set(it.productId, prev);
    }

    for (const [productId, meta] of saleItemsByProduct) {
      const left = meta.quantity - (alreadyRefunded.get(productId) || 0);
      saleItemsByProduct.set(productId, { ...meta, remaining: Math.max(0, left) });
    }
  }

  try {
    // Aggregate duplicate refund lines
    const qtyByProduct = new Map();
    for (const line of items) {
      const productId = String(line?.productId || "");
      if (!productId) continue;
      const qty = Math.max(1, Math.floor(Number(line.quantity) || 1));
      qtyByProduct.set(productId, (qtyByProduct.get(productId) || 0) + qty);
    }
    if (!qtyByProduct.size) throw new Error("لا توجد أصناف للإرجاع");

    let total = new Prisma.Decimal(0);
    const lineData = [];

    for (const [productId, qty] of qtyByProduct) {
      const product = await prisma.product.findFirst({
        where: { id: productId, organizationId: orgId },
      });
      if (!product) throw new Error(`منتج غير موجود: ${productId}`);

      let unitPrice = product.price;
      if (saleItemsByProduct) {
        const sold = saleItemsByProduct.get(productId);
        if (!sold) {
          throw new Error(`المنتج غير موجود في الفاتورة: ${product.name}`);
        }
        if (qty > sold.remaining) {
          throw new Error(
            `كمية الإرجاع تتجاوز المتاح من الفاتورة لـ ${product.name} (متبقي ${sold.remaining})`,
          );
        }
        unitPrice = sold.unitPrice;
      }

      const subtotal = unitPrice.mul(qty);
      total = total.add(subtotal);
      lineData.push({
        productId,
        quantity: qty,
        unitPrice,
        subtotal,
        saleLots: saleItemsByProduct?.get(productId)?.lotUsages || [],
      });
    }

    const refundRisk = assessRefundRisk({
      totalAmount: Number(total),
      note,
    });
    if (!refundRisk.canProceed) {
      return sendError(
        res,
        400,
        "يلزم إدخال سبب للإرجاع عالي القيمة",
        "A note/reason is required for high-value refunds",
        { code: "REFUND_NOTE_REQUIRED", risk: refundRisk },
      );
    }

    const refund = await prisma.$transaction(async (tx) => {
      const created = await tx.refund.create({
        data: {
          branchId: bid,
          userId: req.user.sub,
          saleId: saleRef?.id ?? null,
          ...(clientMutationId ? { clientMutationId } : {}),
          total,
          note: note != null && String(note).trim() ? String(note).trim() : null,
          items: {
            create: lineData.map((l) => ({
              productId: l.productId,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              subtotal: l.subtotal,
            })),
          },
        },
        include: refundInclude,
      });

      for (const l of lineData) {
        await tx.inventory.upsert({
          where: {
            productId_branchId: { productId: l.productId, branchId: bid },
          },
          create: {
            productId: l.productId,
            branchId: bid,
            quantity: l.quantity,
            minStockLevel: 5,
          },
          update: {
            quantity: { increment: l.quantity },
          },
        });

        // Restore FEFO lots from original sale when possible; otherwise create a return lot.
        let left = l.quantity;
        const usages = [...(l.saleLots || [])].reverse(); // restore last consumed first
        for (const u of usages) {
          if (left <= 0) break;
          const take = Math.min(left, Number(u.quantity || 0));
          if (take <= 0) continue;
          const lot = await tx.inventoryLot.findFirst({
            where: { id: u.inventoryLotId, organizationId: orgId },
          });
          if (!lot) continue;
          if (lot.branchId === bid) {
            await tx.inventoryLot.update({
              where: { id: lot.id },
              data: { quantityOnHand: { increment: take } },
            });
          } else {
            await tx.inventoryLot.create({
              data: {
                organizationId: orgId,
                productId: l.productId,
                branchId: bid,
                receivedAt: new Date(),
                expiryDate: lot.expiryDate,
                quantityReceived: take,
                quantityOnHand: take,
                unitCost: lot.unitCost,
                note: `refund-restore:${created.id}`,
              },
            });
          }
          left -= take;
        }
        if (left > 0) {
          await tx.inventoryLot.create({
            data: {
              organizationId: orgId,
              productId: l.productId,
              branchId: bid,
              receivedAt: new Date(),
              expiryDate: null,
              quantityReceived: left,
              quantityOnHand: left,
              unitCost: null,
              note: `refund:${created.id}`,
            },
          });
        }
      }

      return created;
    });

    await writeAudit({
      userId: req.user.sub,
      action: "REFUND_CREATE",
      entityType: "Refund",
      entityId: refund.id,
      branchId: bid,
      summary: `Refund total ${refund.total}`,
      meta: { lines: refund.items?.length, saleId: saleRef?.id ?? null },
    });

    scheduleInventoryWebhook(orgId, {
      event: "refund.created",
      meta: { refundId: refund.id, branchId: bid },
      lines: lineData.map((l) => ({
        branchId: bid,
        productId: l.productId,
        quantityDelta: l.quantity,
      })),
    });

    res.status(201).json(refund);
  } catch (e) {
    if (
      clientMutationId &&
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      const replay = await prisma.refund.findFirst({
        where: {
          clientMutationId,
          branch: { organizationId: req.user.organizationId },
        },
        include: refundInclude,
      });
      if (replay) {
        return res.status(200).json(replay);
      }
    }
    const msg = e instanceof Error ? e.message : "فشل تسجيل الإرجاع";
    res.status(400).json({ error: msg });
  }
});

export default router;
