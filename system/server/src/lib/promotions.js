import { Prisma } from "./prisma-client-bundle.js";

function money(n) {
  return Math.round(Number(n) * 100) / 100;
}

function live(promo, now) {
  if (!promo.active) return false;
  if (promo.startsAt && new Date(promo.startsAt) > now) return false;
  if (promo.endsAt && new Date(promo.endsAt) < now) return false;
  return true;
}

function lineSubtotal(line) {
  return Number(line.subtotal);
}

export function applyPromotions(promotions, { lines = [], goods, code, now = new Date() }) {
  const list = Array.isArray(promotions) ? promotions : [];
  const normalised = String(code || "").trim().toLowerCase();
  if (normalised) {
    const match = list.find((promo) => String(promo.code || "").trim().toLowerCase() === normalised);
    if (match && !live(match, now)) {
      const err = new Error("That code is not active");
      err.status = 400;
      throw err;
    }
  }
  const active = list.filter((promo) => live(promo, now));
  const lineDiscount = lines.map(() => 0);
  let orderDiscount = 0;
  const ids = [];
  let codeApplied = false;

  const applyOne = (promo) => {
    const min = promo.minOrderAmount != null ? Number(promo.minOrderAmount) : 0;
    if (goods < min) return;
    if (promo.kind === "PERCENT" && promo.percent != null) {
      orderDiscount += goods * Number(promo.percent) / 100;
    } else if (promo.kind === "FIXED" && promo.amount != null) {
      orderDiscount += Number(promo.amount);
    } else if (promo.kind === "PRODUCT" || promo.kind === "CATEGORY") {
      lines.forEach((line, index) => {
        const hit = promo.kind === "PRODUCT" ? line.productId === promo.productId : line.categoryId === promo.categoryId;
        if (!hit) return;
        if (promo.percent != null) lineDiscount[index] += lineSubtotal(line) * Number(promo.percent) / 100;
        else if (promo.amount != null) lineDiscount[index] += Number(promo.amount) * (line.sellBy === "WEIGHT" ? 1 : Number(line.quantity) || 1);
      });
    } else if (promo.kind === "BOGO") {
      const buyQty = Math.max(1, Number(promo.buyQty) || 1);
      const getQty = Math.max(1, Number(promo.getQty) || 1);
      const bought = lines
        .filter((line) => line.productId === promo.productId && line.sellBy !== "WEIGHT")
        .reduce((sum, line) => sum + Number(line.quantity || 0), 0);
      let free = Math.floor(bought / buyQty) * getQty;
      lines.forEach((line, index) => {
        if (free < 1 || line.productId !== promo.productId || line.sellBy === "WEIGHT") return;
        const give = Math.min(free, Number(line.quantity) || 0);
        const each = Number(line.quantity) > 0 ? lineSubtotal(line) / Number(line.quantity) : 0;
        lineDiscount[index] += each * give;
        free -= give;
      });
    } else if (promo.kind === "BUNDLE" && Array.isArray(promo.bundleProductIds) && promo.bundlePrice != null) {
      const idsNeeded = promo.bundleProductIds.map(String);
      const present = new Set(lines.filter((line) => Number(line.quantity) > 0).map((line) => line.productId));
      if (!idsNeeded.every((id) => present.has(id))) return;
      const bundleLines = lines
        .map((line, index) => ({ line, index }))
        .filter(({ line }) => idsNeeded.includes(line.productId));
      const sum = bundleLines.reduce((total, row) => total + lineSubtotal(row.line), 0);
      const off = sum - Number(promo.bundlePrice);
      if (off <= 0 || sum <= 0) return;
      bundleLines.forEach(({ line, index }) => {
        lineDiscount[index] += off * (lineSubtotal(line) / sum);
      });
    } else {
      return;
    }
    ids.push(promo.id);
  };

  for (const promo of active.filter((promo) => !promo.code)) applyOne(promo);
  if (normalised) {
    const coded = active.find((promo) => String(promo.code || "").trim().toLowerCase() === normalised);
    if (coded) {
      applyOne(coded);
      codeApplied = true;
    }
  }

  const lineSum = lineDiscount.reduce((total, value) => total + value, 0);
  const room = Math.max(0, goods - lineSum);
  orderDiscount = Math.min(Math.max(0, orderDiscount), room);
  if (orderDiscount > 0 && lines.length) {
    const bases = lines.map((line, index) => Math.max(0, lineSubtotal(line) - lineDiscount[index]));
    const baseSum = bases.reduce((total, value) => total + value, 0);
    let left = orderDiscount;
    bases.forEach((base, index) => {
      const share = index === bases.length - 1 || baseSum <= 0 ? left : money(orderDiscount * (base / baseSum));
      lineDiscount[index] += share;
      left = money(left - share);
    });
  }
  const discount = Math.min(goods, money(lineDiscount.reduce((total, value) => total + value, 0) + (lines.length ? 0 : orderDiscount)));
  return {
    discount,
    lineDiscounts: lineDiscount.map((value) => money(Math.max(0, value))),
    codeApplied,
    ids,
  };
}

export async function quotePromotions(db, { organizationId, channel, lines, goods, code }) {
  const rows = await db.promotion.findMany({
    where: {
      organizationId,
      channel: { in: ["ALL", channel] },
      OR: [
        { active: true },
        ...(code ? [{ code: { equals: String(code).trim(), mode: "insensitive" } }] : []),
      ],
    },
  });
  const result = applyPromotions(rows, { lines, goods: Number(goods) || 0, code });
  return { ...result, discountDec: new Prisma.Decimal(result.discount.toFixed(2)) };
}
