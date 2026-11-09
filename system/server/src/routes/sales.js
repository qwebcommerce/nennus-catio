import { Router } from "express";
import { Prisma } from "../lib/prisma-client-bundle.js";
import { prisma } from "../lib/prisma.js";
import { findBranchInOrg } from "../lib/orgScope.js";
import { authMiddleware } from "../middleware/auth.js";
import { writeAudit } from "../lib/auditLog.js";
import { scheduleInventoryWebhook } from "../lib/inventoryWebhook.js";
import { unitPriceDecimalForSale } from "../lib/productPricing.js";
import { saleRequiresOpenCashSession } from "../lib/saleCash.js";
import {
  dbUnavailableMessage,
  isDbUnavailableError,
} from "../lib/dbErrors.js";
import {
  computeEarnPoints,
  couponDiscountMoney,
  getOrCreateLoyaltySettings,
  loyaltyRedeemMoney,
  normalizeCouponCode,
  normalizePhone,
  shouldDeferLoyaltyEarn,
} from "../lib/loyalty.js";
import { resolveLineModifiers } from "../lib/productModifiers.js";
import {
  consumeLotsFefo,
  ensureLotsCoverQuantity,
} from "../lib/inventoryLots.js";
import { getOrCreateTaxSettings, resolveSaleTaxPercent } from "../lib/taxPacks.js";
import { assessCheckoutRisk } from "../lib/cashierCopilot.js";

const router = Router();
router.use(authMiddleware);

const OK_PAY = new Set(["CASH", "CARD", "ONLINE", "ON_DELIVERY", "ON_ACCOUNT"]);
const SALE_FILTER_PAY = new Set([...OK_PAY, "SPLIT"]);
/** Split tender lines — cash-like methods only (matches POS UI). */
const SPLIT_PAY = new Set(["CASH", "CARD", "ONLINE"]);

function roundMoney(n) {
  return Math.round(n * 100) / 100;
}

function generateInvoiceNumber(branchId) {
  const stamp = Date.now().toString().slice(-8);
  const rand = Math.floor(Math.random() * 9000 + 1000);
  const b = String(branchId || "").slice(-4).toUpperCase();
  return `INV-${b || "MAIN"}-${stamp}-${rand}`;
}

/**
 * @param {unknown} splits
 * @param {number} expectedTotal
 */
function normalizePaymentSplits(splits, expectedTotal) {
  if (splits == null) return { useSplit: false, pm: null, normalized: null };
  if (!Array.isArray(splits) || splits.length < 2) {
    return { useSplit: false, pm: null, normalized: null };
  }
  const norm = [];
  let sum = 0;
  for (const row of splits) {
    const m = String(row?.method || "").toUpperCase();
    if (!SPLIT_PAY.has(m)) {
      throw new Error(
        "تقسيم الدفع يقتصر على نقد / بطاقة / إلكتروني — لا يُسمح بالآجل أو الدفع عند الاستلام داخل التقسيم",
      );
    }
    const raw = String(row?.amount ?? "").replace(",", ".");
    const amt = Number.parseFloat(raw);
    if (Number.isNaN(amt) || amt <= 0) {
      throw new Error("مبلغ غير صالح في تقسيم الدفع");
    }
    const r = roundMoney(amt);
    sum = roundMoney(sum + r);
    norm.push({ method: m, amount: r });
  }
  const exp = roundMoney(expectedTotal);
  if (Math.abs(sum - exp) > 0.02) {
    throw new Error(`مجموع التقسيم (${sum}) يجب أن يساوي المستحق (${exp})`);
  }
  return { useSplit: true, pm: "SPLIT", normalized: norm };
}

router.post("/checkout", async (req, res) => {
  const {
    branchId,
    items,
    paymentMethod,
    paymentSplits,
    customerId,
    discountAmount: discountRaw,
    taxPercent: taxPercentRaw,
    clientMutationId: clientMutationIdRaw,
    deviceId: _deviceId,
    useWholesalePricing: useWholesaleRaw,
    saleChannel: saleChannelRaw,
    couponCode: couponCodeRaw,
    loyaltyPointsToRedeem: loyaltyRedeemRaw,
    guestPhone: guestPhoneRaw,
    tableNumber: tableNumberRaw,
    orderNote: orderNoteRaw,
    discountReason: discountReasonRaw,
  } = req.body || {};
  const rawCh =
    saleChannelRaw != null && String(saleChannelRaw).trim()
      ? String(saleChannelRaw).toUpperCase()
      : null;
  let channel = "RETAIL";
  if (rawCh === "WHOLESALE") channel = "WHOLESALE";
  else if (rawCh === "RETAIL") channel = "RETAIL";
  else channel = Boolean(useWholesaleRaw) ? "WHOLESALE" : "RETAIL";
  const useWholesalePricing = channel === "WHOLESALE";
  const bid = branchId || req.user.branchId;
  if (!bid) return res.status(400).json({ error: "يجب اختيار الفرع" });
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "السلة فارغة" });
  }
  if (req.user.role === "ASSOCIATE") {
    const orgFlags = await prisma.organization.findUnique({
      where: { id: req.user.organizationId },
      select: { associateCanAcceptPayment: true },
    });
    if (orgFlags && orgFlags.associateCanAcceptPayment === false) {
      return res.status(403).json({
        error: "الدفع من بائع الأرضية معطّل — أرسل السلة للكاشير",
        errorAr: "الدفع من بائع الأرضية معطّل — أرسل السلة للكاشير",
        errorEn: "Floor associate payment is disabled — send the cart to the cashier",
        code: "ASSOCIATE_PAYMENT_DISABLED",
      });
    }
  }
  const pmSingle = OK_PAY.has(String(paymentMethod).toUpperCase())
    ? String(paymentMethod).toUpperCase()
    : "CASH";

  if (
    pmSingle === "ON_ACCOUNT" &&
    (!customerId || !String(customerId).trim())
  ) {
    return res.status(400).json({ error: "اختر عميلاً للبيع على الحساب (الآجل)" });
  }
  if (pmSingle === "ON_DELIVERY" && (!customerId || !String(customerId).trim())) {
    return res.status(400).json({
      error: "اختر عميلاً للبيع عند الاستلام",
      errorAr: "اختر عميلاً للبيع عند الاستلام",
      errorEn: "Customer is required for cash on delivery",
      code: "DELIVERY_CUSTOMER_REQUIRED",
    });
  }
  const deliveryAddressRaw = req.body?.deliveryAddress;
  const deliveryAddress =
    deliveryAddressRaw != null && String(deliveryAddressRaw).trim()
      ? String(deliveryAddressRaw).trim().slice(0, 500)
      : null;
  if (pmSingle === "ON_DELIVERY" && !deliveryAddress) {
    return res.status(400).json({
      error: "عنوان التوصيل مطلوب للبيع عند الاستلام",
      errorAr: "عنوان التوصيل مطلوب للبيع عند الاستلام",
      errorEn: "Delivery address is required for cash on delivery",
      code: "DELIVERY_ADDRESS_REQUIRED",
    });
  }

  if (req.user.role !== "ADMIN" && req.user.branchId && req.user.branchId !== bid) {
    return res.status(403).json({ error: "لا يمكن البيع لفرع آخر" });
  }
  const orgId = req.user.organizationId;

  const clientMutationId =
    clientMutationIdRaw != null && String(clientMutationIdRaw).trim()
      ? String(clientMutationIdRaw).trim()
      : null;

  try {
    const branchOk = await findBranchInOrg(prisma, orgId, bid);
    if (!branchOk) return res.status(400).json({ error: "فرع غير صالح" });

    if (clientMutationId) {
      const existing = await prisma.sale.findFirst({
        where: {
          clientMutationId,
          branch: { organizationId: orgId },
        },
        include: {
          items: { include: { product: true } },
          branch: true,
          customer: true,
          user: { select: { id: true, name: true } },
        },
      });
      if (existing) {
        if (existing.branchId !== bid || existing.userId !== req.user.sub) {
          return res.status(409).json({ error: "تعارض معرف المزامنة" });
        }
        return res.status(200).json(existing);
      }
    }

    let custId = null;
    if (customerId != null && String(customerId).trim()) {
      const c = await prisma.customer.findFirst({
        where: { id: String(customerId), organizationId: orgId },
      });
      if (!c) return res.status(400).json({ error: "عميل غير موجود" });
      custId = c.id;
    }

    const loyaltySettings = await getOrCreateLoyaltySettings(prisma, orgId);
    const loyaltyActive =
      loyaltySettings.enabled &&
      !(channel === "WHOLESALE" && loyaltySettings.excludeWholesale);

    const couponCode = normalizeCouponCode(couponCodeRaw);
    const loyaltyRedeemReq = Math.max(
      0,
      Math.floor(Number(loyaltyRedeemRaw) || 0)
    );
    const guestPhoneNorm = normalizePhone(guestPhoneRaw);
    const tableNumber =
      tableNumberRaw != null && String(tableNumberRaw).trim()
        ? String(tableNumberRaw).trim().slice(0, 40)
        : null;
    const orderNoteBase =
      orderNoteRaw != null && String(orderNoteRaw).trim()
        ? String(orderNoteRaw).trim().slice(0, 500)
        : null;
    const discountReason =
      discountReasonRaw != null && String(discountReasonRaw).trim()
        ? String(discountReasonRaw).trim().slice(0, 200)
        : null;
    let orderNote = orderNoteBase;

    let total = new Prisma.Decimal(0);
    const lineData = [];

    for (const line of items) {
      const productId = line.productId;
      const qty = Math.max(1, Math.floor(Number(line.quantity) || 1));
      const product = await prisma.product.findFirst({
        where: { id: productId, organizationId: orgId },
      });
      if (!product) throw new Error(`منتج غير موجود: ${productId}`);
      const inv = await prisma.inventory.findUnique({
        where: {
          productId_branchId: { productId, branchId: bid },
        },
      });
      if (!inv || inv.quantity < qty) {
        throw new Error(`كمية غير كافية: ${product.name}`);
      }
      const basePrice = unitPriceDecimalForSale(product, useWholesalePricing);
      const { selected, delta } = resolveLineModifiers(product, line.modifiers || line.modifierKeys);
      const unitPrice =
        delta === 0
          ? basePrice
          : new Prisma.Decimal(roundMoney(Number(basePrice) + delta).toFixed(2));
      const subtotal = unitPrice.mul(qty);
      total = total.add(subtotal);
      lineData.push({
        productId,
        quantity: qty,
        unitPrice,
        subtotal,
        modifiers: selected.length ? selected : null,
      });
    }

    const subtotalDec = total;
    let discountDec = new Prisma.Decimal(0);
    const d = Number(discountRaw);
    if (!Number.isNaN(d) && d > 0) {
      const cap = Number(subtotalDec);
      const applied = Math.min(d, cap);
      discountDec = new Prisma.Decimal(applied.toFixed(2));
    }

    const checkoutRisk = assessCheckoutRisk({
      subtotal: Number(subtotalDec),
      discountAmount: Number(discountDec),
      itemCount: lineData.length,
      hasDiscountReason: Boolean(discountReason),
    });
    if (!checkoutRisk.canProceed) {
      throw new Error(
        checkoutRisk.requireDiscountReason
          ? "يلزم إدخال سبب للخصم الكبير"
          : "الخصم غير صالح",
      );
    }
    if (discountReason && Number(discountDec) > 0) {
      const tag = `Discount reason: ${discountReason}`;
      orderNote = orderNote ? `${orderNote} · ${tag}`.slice(0, 500) : tag;
    }

    const afterManualDec = subtotalDec.sub(discountDec);
    const afterManualNum = roundMoney(Number(afterManualDec.toString()));

    let couponRow = null;
    let couponDiscountNum = 0;
    if (couponCode) {
      couponRow = await prisma.coupon.findFirst({
        where: { organizationId: orgId, code: couponCode },
      });
      if (!couponRow || !couponRow.active) {
        throw new Error("كوبون غير صالح");
      }
      const now = new Date();
      if (couponRow.validFrom > now) throw new Error("الكوبون غير سارٍ بعد");
      if (couponRow.validUntil && couponRow.validUntil < now) {
        throw new Error("انتهت صلاحية الكوبون");
      }
      if (
        couponRow.maxUsesTotal != null &&
        couponRow.usesCount >= couponRow.maxUsesTotal
      ) {
        throw new Error("استُنفدت استخدامات الكوبون");
      }
      const ch = couponRow.channel;
      if (ch === "RETAIL" && channel === "WHOLESALE") {
        throw new Error("الكوبون لا ينطبق على الجملة");
      }
      if (ch === "WHOLESALE" && channel === "RETAIL") {
        throw new Error("الكوبون لا ينطبق على التجزئة");
      }
      const minO = couponRow.minOrderAmount != null ? Number(couponRow.minOrderAmount) : 0;
      if (afterManualNum < minO) {
        throw new Error("الحد الأدنى للطلب غير مستوفى للكوبون");
      }
    }

    if (couponRow) {
      couponDiscountNum = couponDiscountMoney(
        afterManualNum,
        couponRow,
        afterManualNum
      );
    }

    let afterCouponNum = roundMoney(afterManualNum - couponDiscountNum);
    if (afterCouponNum < 0) afterCouponNum = 0;

    if (
      loyaltyRedeemReq > 0 &&
      couponRow &&
      !loyaltySettings.allowCouponWithPoints
    ) {
      throw new Error("لا يمكن الجمع بين الكوبون واستبدال النقاط حسب إعدادات المحل");
    }

    if (loyaltyRedeemReq > 0 && loyaltyActive && loyaltySettings.redemptionEnabled) {
      if (!custId && !guestPhoneNorm) {
        throw new Error("اختر عميلاً أو أدخل رقم هاتف لاستبدال النقاط");
      }
    }

    if (!custId && guestPhoneNorm) {
      let gc = await prisma.customer.findFirst({
        where: { organizationId: orgId, phone: guestPhoneNorm },
      });
      if (!gc) {
        gc = await prisma.customer.create({
          data: {
            organizationId: orgId,
            name: `زائر ${guestPhoneNorm}`,
            phone: guestPhoneNorm,
          },
        });
      }
      custId = gc.id;
    }

    let custRow = custId
      ? await prisma.customer.findUnique({ where: { id: custId } })
      : null;

    let redeemPointsUsed = 0;
    let loyaltyDiscountNum = 0;
    if (
      loyaltyActive &&
      loyaltySettings.redemptionEnabled &&
      custRow &&
      loyaltyRedeemReq > 0
    ) {
      const r = loyaltyRedeemMoney(
        loyaltyRedeemReq,
        custRow.loyaltyPoints,
        loyaltySettings,
        afterCouponNum
      );
      redeemPointsUsed = r.pointsUsed;
      loyaltyDiscountNum = r.money;
    }

    const afterLoyaltyNum = roundMoney(afterCouponNum - loyaltyDiscountNum);
    const afterLoyaltyDec = new Prisma.Decimal(afterLoyaltyNum.toFixed(2));

    const taxSettings = await getOrCreateTaxSettings(prisma, orgId);
    const tp = resolveSaleTaxPercent(taxPercentRaw, taxSettings);
    let taxDec = new Prisma.Decimal(0);
    if (tp > 0) {
      taxDec = afterLoyaltyDec.mul(new Prisma.Decimal(tp)).div(100);
    }
    const grandTotal = afterLoyaltyDec.add(taxDec);
    const grandNum = roundMoney(Number(grandTotal.toString()));

    const splitInfo = normalizePaymentSplits(paymentSplits, grandNum);
    let pm = splitInfo.useSplit ? "SPLIT" : pmSingle;
    if (splitInfo.useSplit && pmSingle === "ON_DELIVERY") {
      throw new Error("لا يمكن تقسيم الدفع مع الدفع عند الاستلام");
    }
    if (splitInfo.useSplit && pmSingle === "ON_ACCOUNT") {
      throw new Error("لا يمكن تقسيم الدفع مع البيع على الحساب");
    }

    const amountPaidRaw = (req.body || {}).amountPaid;
    let amountPaidNum = grandNum;
    let amountDueNum = 0;
    if (splitInfo.useSplit) {
      if (amountPaidRaw != null && String(amountPaidRaw).trim() !== "") {
        throw new Error("لا يمكن دفع جزئي مع تقسيم طرق الدفع");
      }
      amountPaidNum = grandNum;
      amountDueNum = 0;
    } else if (pm === "ON_DELIVERY") {
      // Not collected at till — keep invoice open until cash is received.
      amountPaidNum = 0;
      amountDueNum = grandNum;
    } else if (pm === "ON_ACCOUNT") {
      amountPaidNum = 0;
      amountDueNum = grandNum;
    } else {
      if (amountPaidRaw != null && String(amountPaidRaw).trim() !== "") {
        amountPaidNum = roundMoney(
          Number(String(amountPaidRaw).replace(",", "."))
        );
        if (Number.isNaN(amountPaidNum) || amountPaidNum < 0) {
          throw new Error("مبلغ المدفوع غير صالح");
        }
        if (amountPaidNum - grandNum > 0.02) {
          throw new Error("المبلغ المدفوع يتجاوز إجمالي الفاتورة");
        }
        amountDueNum = roundMoney(grandNum - amountPaidNum);
        if (amountDueNum < 0) amountDueNum = 0;
      } else {
        amountPaidNum = grandNum;
        amountDueNum = 0;
      }
      if (amountDueNum > 0.02 && !custId) {
        throw new Error("يجب اختيار عميلاً للبيع بالآجل (المتبقي على الحساب)");
      }
    }

    const needsCashDrawer = saleRequiresOpenCashSession(
      pm,
      splitInfo.useSplit ? splitInfo.normalized : null,
      amountPaidNum,
    );
    const openSession = await prisma.cashSession.findFirst({
      where: {
        branchId: bid,
        closedAt: null,
        branch: { organizationId: orgId },
      },
      select: { id: true },
    });
    if (needsCashDrawer && !openSession) {
      throw new Error(
        "لا توجد جلسة صندوق مفتوحة — افتح الصندوق من صفحة الصندوق قبل البيع النقدي",
      );
    }
    // Attach non-delivery paid sales to the open session when present (cash required above).
    const attachSessionId =
      pm !== "ON_DELIVERY" && amountPaidNum > 0.005 && openSession
        ? openSession.id
        : null;

    const eligibleBase = afterCouponNum;
    const minEarn = Number(loyaltySettings.minOrderForEarn || 0);
    let canEarn =
      loyaltyActive &&
      custRow &&
      eligibleBase >= minEarn &&
      !(loyaltySettings.guestPhoneRequired && !String(custRow.phone || "").trim());

    if (amountDueNum > 0.01) {
      canEarn = false;
    }

    const deferEarn =
      canEarn &&
      shouldDeferLoyaltyEarn(
        loyaltySettings,
        splitInfo.useSplit ? "SPLIT" : pm,
        splitInfo.useSplit
      );

    let pointsEarnedPreview = 0;
    if (canEarn) {
      const lifeBefore = Number(custRow.lifetimeSpend || 0);
      pointsEarnedPreview = computeEarnPoints(
        loyaltySettings,
        eligibleBase,
        lifeBefore
      );
    }

    const saleInclude = {
      items: { include: { product: true } },
      branch: true,
      customer: true,
      user: { select: { id: true, name: true, nameEn: true, role: true, email: true } },
      coupon: true,
    };

    const sale = await prisma.$transaction(async (tx) => {
      let customerIdFinal = custId;
      if (customerIdFinal) {
        const lock = await tx.customer.findUnique({
          where: { id: customerIdFinal },
        });
        if (!lock) throw new Error("عميل غير موجود");
      }

      if (
        couponRow &&
        customerIdFinal &&
        couponRow.maxUsesPerCustomer != null
      ) {
        const used = await tx.sale.count({
          where: {
            couponId: couponRow.id,
            customerId: customerIdFinal,
          },
        });
        if (used >= couponRow.maxUsesPerCustomer) {
          throw new Error("استُنفدت استخدامات الكوبون لهذا العميل");
        }
      }

      if (redeemPointsUsed > 0 && customerIdFinal) {
        await tx.customer.update({
          where: { id: customerIdFinal },
          data: { loyaltyPoints: { decrement: redeemPointsUsed } },
        });
      }

      const couponDiscDec = new Prisma.Decimal(couponDiscountNum.toFixed(2));
      const loyaltyDiscDec = new Prisma.Decimal(loyaltyDiscountNum.toFixed(2));

      let awardStatus = "NONE";
      let pointsEarnedVal = null;
      if (canEarn && pointsEarnedPreview > 0) {
        awardStatus = deferEarn ? "PENDING" : "AWARDED";
        pointsEarnedVal = pointsEarnedPreview;
      }

      const created = await tx.sale.create({
        data: {
          branchId: bid,
          userId: req.user.sub,
          customerId: customerIdFinal,
          channel,
          ...(clientMutationId ? { clientMutationId } : {}),
          total: grandTotal,
          discountAmount: discountDec,
          taxAmount: taxDec,
          taxPercent: new Prisma.Decimal(tp.toFixed(2)),
          amountPaid: new Prisma.Decimal(amountPaidNum.toFixed(2)),
          amountDue: new Prisma.Decimal(amountDueNum.toFixed(2)),
          invoiceNumber: generateInvoiceNumber(bid),
          invoiceStatus:
            amountDueNum <= 0.01 ? "PAID" : amountPaidNum > 0.01 ? "PARTIAL" : "ISSUED",
          dueDate: amountDueNum > 0.01 ? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) : null,
          paidAt: amountDueNum <= 0.01 ? new Date() : null,
          paymentMethod: pm,
          ...(splitInfo.useSplit ? { paymentSplits: splitInfo.normalized } : {}),
          cashSessionId: attachSessionId,
          couponId: couponRow?.id ?? null,
          couponDiscountAmount: couponDiscDec,
          loyaltyPointsRedeemed: redeemPointsUsed,
          loyaltyDiscountAmount: loyaltyDiscDec,
          loyaltyPointsEarned:
            pointsEarnedVal != null ? pointsEarnedVal : null,
          loyaltyAwardStatus: awardStatus,
          loyaltyEligibleBase:
            canEarn && pointsEarnedPreview > 0
              ? new Prisma.Decimal(eligibleBase.toFixed(2))
              : null,
          tableNumber,
          orderNote,
          deliveryAddress,
          items: {
            create: lineData.map((l) => ({
              productId: l.productId,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              subtotal: l.subtotal,
              ...(l.modifiers ? { modifiers: l.modifiers } : {}),
            })),
          },
        },
        include: saleInclude,
      });

      for (const l of lineData) {
        await tx.inventory.update({
          where: {
            productId_branchId: { productId: l.productId, branchId: bid },
          },
          data: { quantity: { decrement: l.quantity } },
        });
      }

      // FEFO lot allocation: consume earliest-expiry lots first for traceability.
      // If lots drifted behind aggregate stock, auto-cover then consume so refunds can restore.
      for (const saleItem of created.items) {
        const needed = Number(saleItem.quantity || 0);
        if (needed <= 0) continue;
        await ensureLotsCoverQuantity(tx, {
          orgId,
          branchId: bid,
          productId: saleItem.productId,
          quantity: needed,
          note: "sale-unlotted-cover",
        });
        const taken = await consumeLotsFefo(tx, {
          orgId,
          branchId: bid,
          productId: saleItem.productId,
          quantity: needed,
        });
        if (taken.length > 0) {
          await tx.saleItemLot.createMany({
            data: taken.map((t) => ({
              organizationId: orgId,
              saleItemId: saleItem.id,
              inventoryLotId: t.lotId,
              quantity: t.quantity,
            })),
          });
        }
      }

      if (couponRow) {
        await tx.coupon.update({
          where: { id: couponRow.id },
          data: { usesCount: { increment: 1 } },
        });
      }

      if (redeemPointsUsed > 0 && customerIdFinal) {
        const bal = await tx.customer.findUnique({
          where: { id: customerIdFinal },
        });
        await tx.loyaltyLedger.create({
          data: {
            organizationId: orgId,
            customerId: customerIdFinal,
            saleId: created.id,
            type: "REDEEM",
            points: -redeemPointsUsed,
            balanceAfter: bal.loyaltyPoints,
            note: "استبدال نقاط",
          },
        });
      }

      if (
        canEarn &&
        pointsEarnedPreview > 0 &&
        !deferEarn &&
        customerIdFinal
      ) {
        const updated = await tx.customer.update({
          where: { id: customerIdFinal },
          data: {
            loyaltyPoints: { increment: pointsEarnedPreview },
            lifetimeSpend: { increment: eligibleBase },
          },
        });
        await tx.loyaltyLedger.create({
          data: {
            organizationId: orgId,
            customerId: customerIdFinal,
            saleId: created.id,
            type: "EARN",
            points: pointsEarnedPreview,
            balanceAfter: updated.loyaltyPoints,
            note: "كسب نقاط من بيع",
          },
        });
      }

      if (amountDueNum > 0.01 && customerIdFinal && pm !== "ON_DELIVERY") {
        const dueDec = new Prisma.Decimal(amountDueNum.toFixed(2));
        await tx.customerAccountLedger.create({
          data: {
            organizationId: orgId,
            customerId: customerIdFinal,
            branchId: bid,
            entryType: "SALE_CREDIT",
            amount: dueDec,
            saleId: created.id,
            createdByUserId: req.user.sub,
          },
        });
        await tx.customer.update({
          where: { id: customerIdFinal },
          data: { accountBalance: { increment: dueDec } },
        });
      }

      return created;
    }, { maxWait: 10000, timeout: 60000 });

    await writeAudit({
      userId: req.user.sub,
      action: "SALE_CHECKOUT",
      entityType: "Sale",
      entityId: sale.id,
      branchId: bid,
      summary: `Total ${sale.total} ${sale.paymentMethod}`,
      meta: {
        paymentMethod: sale.paymentMethod,
        lines: items.length,
        split: sale.paymentMethod === "SPLIT",
        channel: sale.channel,
      },
    });

    scheduleInventoryWebhook(orgId, {
      event: "sale.checkout",
      meta: { saleId: sale.id, branchId: bid },
      lines: lineData.map((l) => ({
        branchId: bid,
        productId: l.productId,
        quantityDelta: -l.quantity,
      })),
    });

    return res.status(201).json(sale);
  } catch (e) {
    if (res.headersSent) {
      console.error("[checkout] error after response", e);
      return;
    }
    if (isDbUnavailableError(e)) {
      return res.status(503).json({ error: dbUnavailableMessage });
    }
    if (
      clientMutationId &&
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      try {
        const replay = await prisma.sale.findFirst({
          where: {
            clientMutationId,
            branch: { organizationId: req.user.organizationId },
          },
          include: {
            items: { include: { product: true } },
            branch: true,
            customer: true,
            user: { select: { id: true, name: true } },
          },
        });
        if (replay) {
          return res.status(200).json(replay);
        }
      } catch (replayErr) {
        console.error("[checkout] idempotency replay failed", replayErr);
      }
    }
    let msg = e instanceof Error ? e.message : "فشل إتمام البيع";
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      (e.code === "P2022" || e.code === "P2010")
    ) {
      msg =
        "مخطط قاعدة البيانات غير متوافق (عمود أو جدول ناقص). نفّذ ترحيلات Prisma على الخادم: prisma migrate deploy";
    }
    return res.status(400).json({ error: msg });
  }
});

/** تأكيد استلام الطلب — منح نقاط الولاء المعلّقة (دفع عند الاستلام / توقيت الاستلام) */
router.post("/:saleId/confirm-delivery", async (req, res) => {
  const orgId = req.user.organizationId;
  const saleId = String(req.params.saleId || "").trim();
  if (!saleId) return res.status(400).json({ error: "معرّف غير صالح" });

  try {
    const out = await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findFirst({
        where: { id: saleId, branch: { organizationId: orgId } },
        include: { customer: true, branch: true },
      });
      if (!sale) throw new Error("الفاتورة غير موجودة");
      if (
        req.user.role !== "ADMIN" &&
        req.user.branchId &&
        sale.branchId !== req.user.branchId
      ) {
        throw new Error("غير مصرح");
      }
      if (sale.loyaltyAwardStatus !== "PENDING") {
        throw new Error("لا توجد نقاط معلّقة على هذه الفاتورة");
      }
      if (!sale.customerId || sale.loyaltyEligibleBase == null) {
        throw new Error("لا يمكن تأكيد الولاء لهذه الفاتورة");
      }

      const settings = await getOrCreateLoyaltySettings(tx, orgId);
      if (!settings.enabled) throw new Error("برنامج الولاء غير مفعّل");

      const eligible = roundMoney(Number(sale.loyaltyEligibleBase));
      const cust = await tx.customer.findUnique({
        where: { id: sale.customerId },
      });
      if (!cust) throw new Error("عميل غير موجود");

      const lifeBefore = Number(cust.lifetimeSpend);
      const points = computeEarnPoints(settings, eligible, lifeBefore);

      const updated = await tx.customer.update({
        where: { id: cust.id },
        data: {
          lifetimeSpend: { increment: eligible },
          ...(points > 0 ? { loyaltyPoints: { increment: points } } : {}),
        },
      });

      if (points > 0) {
        await tx.loyaltyLedger.create({
          data: {
            organizationId: orgId,
            customerId: cust.id,
            saleId: sale.id,
            type: "EARN",
            points,
            balanceAfter: updated.loyaltyPoints,
            note: "كسب بعد تأكيد الاستلام",
          },
        });
      }

      await tx.sale.update({
        where: { id: sale.id },
        data: {
          loyaltyAwardStatus: "AWARDED",
          loyaltyPointsEarned: points,
        },
      });

      return tx.sale.findFirst({
        where: { id: sale.id },
        include: {
          items: { include: { product: true } },
          branch: true,
          customer: true,
          user: { select: { id: true, name: true } },
          coupon: true,
        },
      });
    }, { maxWait: 10000, timeout: 60000 });

    res.json(out);
  } catch (e) {
    if (isDbUnavailableError(e)) {
      return res.status(503).json({ error: dbUnavailableMessage });
    }
    const msg = e instanceof Error ? e.message : "فشل التأكيد";
    return res.status(400).json({ error: msg });
  }
});

router.get("/", async (req, res) => {
  const { branchId, from, to, limit = "50", paymentMethod, q } = req.query;
  const where = {
    branch: { organizationId: req.user.organizationId },
  };
  const bid = branchId || (req.user.role === "ADMIN" ? undefined : req.user.branchId);
  if (bid) where.branchId = String(bid);
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(String(from));
    if (to) where.createdAt.lte = new Date(String(to));
  }
  const pm = paymentMethod != null ? String(paymentMethod).trim().toUpperCase() : "";
  if (pm && SALE_FILTER_PAY.has(pm)) {
    where.paymentMethod = pm;
  }
  const query = q != null ? String(q).trim() : "";
  if (query) {
    where.AND = [
      ...(where.AND || []),
      {
        OR: [
          { invoiceNumber: { contains: query, mode: "insensitive" } },
          { id: { contains: query, mode: "insensitive" } },
          { customer: { name: { contains: query, mode: "insensitive" } } },
          { customer: { phone: { contains: query, mode: "insensitive" } } },
        ],
      },
    ];
  }
  const sales = await prisma.sale.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: Math.min(200, Math.max(1, parseInt(String(limit), 10) || 50)),
    include: {
      items: { include: { product: { select: { name: true, nameEn: true, sku: true } } } },
      branch: { select: { name: true } },
      customer: { select: { id: true, name: true, phone: true } },
      user: { select: { id: true, name: true, nameEn: true, role: true, email: true } },
    },
  });
  res.json(sales);
});

router.get("/:id", async (req, res) => {
  const sale = await prisma.sale.findFirst({
    where: {
      id: req.params.id,
      branch: { organizationId: req.user.organizationId },
    },
    include: {
      items: { include: { product: true } },
      branch: true,
      customer: true,
      user: { select: { id: true, name: true, nameEn: true, role: true, email: true } },
    },
  });
  if (!sale) return res.status(404).json({ error: "الفاتورة غير موجودة" });
  if (req.user.role !== "ADMIN" && req.user.branchId && sale.branchId !== req.user.branchId) {
    return res.status(403).json({ error: "غير مصرح" });
  }
  res.json(sale);
});

export default router;
