import { Router } from "express";
import { Prisma } from "../lib/prisma-client-bundle.js";
import { prisma } from "../lib/prisma.js";
import { findBranchInOrg } from "../lib/orgScope.js";
import { authMiddleware, requireModule } from "../middleware/auth.js";
import { writeAudit } from "../lib/auditLog.js";
import { moveStock } from "../lib/stockLedger.js";
import { cashPortionFromSale } from "../lib/saleCash.js";

const router = Router();
router.use(authMiddleware);
router.use(requireModule("pos", "view"));

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

/** Till refund tenders. A refund goes back the way the customer paid unless staff choose otherwise. */
const REFUND_METHODS = new Set(["CASH", "CARD", "FAWRAN", "PAYMENT_LINK"]);

function refundError(errorAr, errorEn, status = 400, code) {
  const err = new Error(errorAr);
  err.status = status;
  err.errorAr = errorAr;
  err.errorEn = errorEn;
  if (code) err.code = code;
  return err;
}

const cents = (v) => Math.round(Number(v != null && typeof v === "object" ? v.toString() : v || 0) * 100);

/**
 * What the customer actually paid for each sale line, in cents: the line subtotal less its
 * promotion discount, less its share of sale-level discounts, scaled to the amount paid.
 * Rounding leftovers go to the lines with the largest remainders so the lines add up exactly.
 */
function paidCentsByLine(sale) {
  const nets = sale.items.map((it) => Math.max(0, cents(it.subtotal) - cents(it.discountAmount)));
  const sumNet = nets.reduce((a, b) => a + b, 0);
  const total = cents(sale.total);
  const goods = Math.max(0, total - cents(sale.deliveryFee));
  const paid = Math.max(0, Math.min(total, cents(sale.amountPaid)));
  const paidGoods = total > 0 ? Math.round((goods * paid) / total) : 0;
  const out = new Map();
  if (sumNet <= 0 || paidGoods <= 0) {
    for (const it of sale.items) out.set(it.id, 0);
    return { byLine: out, paid };
  }
  const exact = nets.map((n) => (paidGoods * n) / sumNet);
  const base = exact.map((x) => Math.floor(x));
  let left = paidGoods - base.reduce((a, b) => a + b, 0);
  const order = exact.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (left <= 0) break;
    base[i] += 1;
    left -= 1;
  }
  sale.items.forEach((it, i) => out.set(it.id, base[i]));
  return { byLine: out, paid };
}

function defaultRefundMethod(sale) {
  const pm = String(sale.paymentMethod || "");
  if (REFUND_METHODS.has(pm)) return pm;
  if (pm === "SPLIT") return cashPortionFromSale(sale) > 0.005 ? "CASH" : "CARD";
  return null;
}

router.post("/", requireModule("pos", "refund"), async (req, res) => {
  const {
    branchId,
    saleId,
    note,
    items,
    clientMutationId: clientMutationIdRaw,
    deviceId: _deviceId,
    restock: restockRaw,
    method: methodRaw,
  } = req.body || {};
  // FR-80: goods go back on the shelf only when staff mark them as returned.
  const restock = restockRaw === true || restockRaw === "true";
  const bid = branchId || req.user.branchId;
  if (!bid) return res.status(400).json({ error: "يجب اختيار الفرع" });
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "لا توجد أصناف للإرجاع" });
  }
  if (saleId == null || !String(saleId).trim()) {
    return res.status(400).json({
      error: "اختر الفاتورة التي يُرجع منها",
      errorAr: "اختر الفاتورة التي يُرجع منها",
      errorEn: "A refund must name the sale it comes from",
      code: "REFUND_SALE_REQUIRED",
    });
  }
  let methodChoice = null;
  if (methodRaw != null && String(methodRaw).trim()) {
    methodChoice = String(methodRaw).trim().toUpperCase();
    if (!REFUND_METHODS.has(methodChoice)) {
      return res.status(400).json({
        error: "طريقة الإرجاع غير معروفة",
        errorAr: "طريقة الإرجاع غير معروفة",
        errorEn: "Unknown refund method",
        code: "REFUND_METHOD_INVALID",
      });
    }
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

  const sid = String(saleId).trim();
  try {
    const refund = await prisma.$transaction(
      async (tx) => {
        // Lock the sale so two refunds of the same sale cannot both pass the limits below.
        const locked = await tx.$queryRaw`
          SELECT s.id FROM "Sale" s JOIN "Branch" b ON b.id = s."branchId"
          WHERE s.id = ${sid} AND b."organizationId" = ${orgId} FOR UPDATE OF s`;
        if (!locked.length) throw refundError("فاتورة غير موجودة", "Sale not found");
        const sale = await tx.sale.findUnique({
          where: { id: sid },
          include: {
            items: { include: { product: { select: { id: true, name: true, sellBy: true } } }, orderBy: { id: "asc" } },
            refunds: { include: { items: true } },
          },
        });
        if (sale.branchId !== bid) throw refundError("الفاتورة من فرع آخر", "This sale was taken at another location");
        if (sale.webStatus === "PENDING_PAYMENT" || sale.webStatus === "CANCELLED") {
          throw refundError("هذا الطلب غير مدفوع", "This order was not paid");
        }

        const { byLine: paidByLine, paid } = paidCentsByLine(sale);
        if (paid <= 0) throw refundError("لا يوجد مبلغ مدفوع على هذه الفاتورة", "Nothing was paid on this sale");

        // What earlier refunds already took from each line.
        const lineState = new Map(
          sale.items.map((it) => [it.id, { line: it, refQty: 0, refCents: 0, reqQty: 0 }]),
        );
        let priorTotalCents = 0;
        for (const r of sale.refunds) {
          priorTotalCents += cents(r.total);
          for (const ri of r.items) {
            const linked = ri.saleItemId ? lineState.get(ri.saleItemId) : null;
            if (linked) {
              linked.refQty += ri.quantity;
              linked.refCents += cents(ri.subtotal);
              continue;
            }
            // Older rows carry only the product: spread over that product's lines in order.
            let qtyLeft = ri.quantity;
            for (const st of lineState.values()) {
              if (qtyLeft <= 0) break;
              if (st.line.productId !== ri.productId) continue;
              const room = st.line.quantity - st.refQty;
              if (room <= 0) continue;
              const take = Math.min(room, qtyLeft);
              st.refQty += take;
              st.refCents += Math.round((cents(ri.subtotal) * take) / ri.quantity);
              qtyLeft -= take;
            }
          }
        }

        // Match the requested lines to sale lines.
        for (const raw of items) {
          const productId = String(raw?.productId || "");
          const saleItemId = raw?.saleItemId ? String(raw.saleItemId) : "";
          const variantId = raw?.variantId ? String(raw.variantId) : "";
          const candidates = [...lineState.values()].filter((st) =>
            saleItemId
              ? st.line.id === saleItemId
              : st.line.productId === productId && (!variantId || st.line.variantId === variantId),
          );
          if (!candidates.length) {
            throw refundError("الصنف غير موجود في الفاتورة", "This item is not on the sale");
          }
          const product = candidates[0].line.product;
          const n = Number(raw?.quantity);
          const qty = product.sellBy === "WEIGHT" ? Math.round(n) : n;
          if (!Number.isFinite(n) || !Number.isInteger(qty) || qty < 1) {
            throw refundError(
              product.sellBy === "WEIGHT" ? `وزن غير صالح: ${product.name}` : `كمية غير صالحة: ${product.name}`,
              product.sellBy === "WEIGHT"
                ? `Enter a weight in grams above zero: ${product.name}`
                : `Enter a whole quantity above zero: ${product.name}`,
            );
          }
          let left = qty;
          for (const st of candidates) {
            if (left <= 0) break;
            const room = st.line.quantity - st.refQty - st.reqQty;
            if (room <= 0) continue;
            const take = Math.min(room, left);
            st.reqQty += take;
            left -= take;
          }
          if (left > 0) {
            throw refundError(
              `كمية الإرجاع تتجاوز المتبقي في الفاتورة لـ ${product.name}`,
              `The refund is more than is left on the sale for ${product.name}`,
            );
          }
        }

        // Money per line from what was paid; never more than is left on the line.
        let totalCents = 0;
        const lineData = [];
        for (const st of lineState.values()) {
          if (!st.reqQty) continue;
          const lineQty = st.line.quantity;
          const linePaid = paidByLine.get(st.line.id) || 0;
          const lineLeft = Math.max(0, linePaid - st.refCents);
          const closesLine = st.refQty + st.reqQty >= lineQty;
          const amount = closesLine ? lineLeft : Math.min(lineLeft, Math.round((linePaid * st.reqQty) / lineQty));
          totalCents += amount;
          const lineCost = Number(st.line.costAmount || 0);
          lineData.push({
            saleItemId: st.line.id,
            productId: st.line.productId,
            variantId: st.line.variantId || null,
            quantity: st.reqQty,
            unitPrice: st.line.unitPrice,
            subtotal: new Prisma.Decimal((amount / 100).toFixed(2)),
            costAmount: restock && lineQty > 0 ? (lineCost * st.reqQty) / lineQty : null,
            unitCost: st.line.unitCost,
          });
        }
        if (priorTotalCents + totalCents > paid) {
          throw refundError("مجموع المرتجعات يتجاوز المدفوع على الفاتورة", "Refunds cannot add up to more than was paid on the sale");
        }

        const method = methodChoice || defaultRefundMethod(sale);
        if (!method) {
          throw refundError("اختر طريقة إرجاع المبلغ", "Choose how the money is refunded", 400, "REFUND_METHOD_REQUIRED");
        }
        const openSession = await tx.cashSession.findFirst({
          where: { branchId: bid, closedAt: null },
          select: { id: true },
        });
        if (method === "CASH" && totalCents > 0 && !openSession) {
          throw refundError(
            "لا توجد جلسة صندوق مفتوحة — افتح الصندوق قبل الإرجاع النقدي",
            "Open the till before giving a cash refund",
          );
        }

        const created = await tx.refund.create({
          data: {
            branchId: bid,
            userId: req.user.sub,
            saleId: sale.id,
            ...(clientMutationId ? { clientMutationId } : {}),
            total: new Prisma.Decimal((totalCents / 100).toFixed(2)),
            method,
            cashSessionId: openSession?.id ?? null,
            note: note != null && String(note).trim() ? String(note).trim() : null,
            items: {
              create: lineData.map((l) => ({
                productId: l.productId,
                saleItemId: l.saleItemId,
                variantId: l.variantId,
                quantity: l.quantity,
                unitPrice: l.unitPrice,
                subtotal: l.subtotal,
                ...(l.costAmount != null ? { costAmount: new Prisma.Decimal(Number(l.costAmount).toFixed(4)) } : {}),
              })),
            },
          },
        });

        if (restock) {
          // FR-78/80: back to the location the sale was taken from, with a RETURN movement.
          for (const l of lineData) {
            await moveStock(tx, {
              orgId,
              userId: req.user.sub,
              productId: l.productId,
              variantId: l.variantId,
              branchId: sale.branchId,
              delta: l.quantity,
              reason: "RETURN",
              note: created.id,
              receiptUnitCost: l.unitCost != null ? Number(l.unitCost) : null,
            });
          }
        }

        return tx.refund.findUnique({ where: { id: created.id }, include: refundInclude });
      },
      { maxWait: 10000, timeout: 60000 },
    );

    await writeAudit({
      userId: req.user.sub,
      action: "REFUND_CREATE",
      entityType: "Refund",
      entityId: refund.id,
      branchId: bid,
      summary: `Refund total ${refund.total} ${refund.method}${restock ? " restocked" : ""}`,
      meta: { lines: refund.items?.length, saleId: refund.saleId, method: refund.method, restock },
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
    res.status(e?.status || 400).json({
      error: msg,
      ...(e?.errorAr ? { errorAr: e.errorAr, errorEn: e.errorEn } : {}),
      ...(e?.code && typeof e.code === "string" && !e.code.startsWith("P") ? { code: e.code } : {}),
    });
  }
});

export default router;
