/**
 * Purchase-order money beyond the goods bill: prepayments (deposits paid before the goods arrive),
 * freight bills (landed cost) and bill due dates from payment terms.
 *
 * Prepayment rule: a prepayment is money paid to the supplier against one purchase order. It is
 * never a SupplierPayment. It is applied (SupplierPrepaymentApplication) to that order's GOODS
 * bills: at once to any bill still open, otherwise to the bill raised by the next receipt. The bill's
 * amountPaid includes what was applied, so the bill shows PAID / PARTIAL correctly, while money out
 * is counted once, on the prepayment's own date. Supplier balance = bills − bill payments −
 * prepayments (an unapplied prepayment is a credit with the supplier).
 *
 * Freight rule (landed cost): a FREIGHT bill (a SupplierBill of a supplier marked as a freight
 * company) is spread over the order's lines by line value (largest remainder, exact). Each receipt
 * adds the freight share of the quantity received to the unit cost of the goods coming in (the
 * location's weighted average cost moves as usual). If the freight bill is added after goods were
 * received, the share of the quantity already received is added to the unit cost of what is still
 * on hand at the order's location (up to the received quantity); the share of goods already sold
 * cannot go back into past sales and is reported in finance as "Freight on goods already sold".
 *
 * All amounts are whole dirhams (NFR-03).
 */
import { d, divRound, lineAmount, splitProportional } from "./money.js";
import { fail, addDays } from "./bizError.js";
import { lockStockRow } from "./stockLedger.js";
import { stockRowKey } from "./dbErrors.js";
import { todayDate } from "./salesOrders.js";

/** Order value at its unit costs (what the order is worth when fully received). */
export function orderValue(order, sellBy) {
  return (order.lines || []).reduce((s, l) => s + lineAmount(l.unitCost, l.quantity, sellBy.get(l.productId)), 0);
}

export async function sellByMap(db, lines) {
  const rows = await db.product.findMany({ where: { id: { in: [...new Set(lines.map((l) => l.productId))] } }, select: { id: true, sellBy: true } });
  return new Map(rows.map((p) => [p.id, p.sellBy]));
}

/** Due date of a new goods bill: the order's due date, else receipt day + terms (order, then supplier). */
export async function billDueDate(tx, order) {
  if (order.paymentDueDate) return order.paymentDueDate;
  let days = order.paymentTermsDays;
  if (days == null) {
    const supplier = await tx.supplier.findUnique({ where: { id: order.supplierId }, select: { paymentTermsDays: true } });
    days = supplier?.paymentTermsDays ?? 0;
  }
  return addDays(todayDate(), days);
}

/**
 * Applies the order's unapplied prepayments to its open GOODS bills, oldest first. Locks the
 * prepayment and bill rows. Returns the total applied.
 */
export async function applyPrepaymentsTx(tx, purchaseOrderId) {
  const prepay = await tx.$queryRaw`
    SELECT id, amount, "amountApplied" FROM "SupplierPrepayment"
    WHERE "purchaseOrderId" = ${purchaseOrderId} AND amount > "amountApplied"
    ORDER BY "paidAt", id FOR UPDATE`;
  if (!prepay.length) return 0;
  const bills = await tx.$queryRaw`
    SELECT id, amount, "amountPaid" FROM "SupplierBill"
    WHERE "purchaseOrderId" = ${purchaseOrderId} AND kind = 'GOODS' AND "amountPaid" < amount
    ORDER BY "createdAt", id FOR UPDATE`;
  let applied = 0;
  for (const bill of bills) {
    let open = d(bill.amount) - d(bill.amountPaid);
    for (const p of prepay) {
      if (open <= 0) break;
      const left = d(p.amount) - d(p.amountApplied);
      if (left <= 0) continue;
      const take = Math.min(left, open);
      await tx.supplierPrepaymentApplication.create({ data: { prepaymentId: p.id, billId: bill.id, amount: take } });
      p.amountApplied = d(p.amountApplied) + take;
      await tx.supplierPrepayment.update({ where: { id: p.id }, data: { amountApplied: p.amountApplied } });
      open -= take;
      applied += take;
    }
    const amountPaid = d(bill.amount) - open;
    if (amountPaid !== d(bill.amountPaid)) {
      await tx.supplierBill.update({
        where: { id: bill.id },
        data: { amountPaid, status: amountPaid >= d(bill.amount) ? "PAID" : amountPaid > 0 ? "PARTIAL" : "OPEN" },
      });
    }
  }
  return applied;
}

/** FREIGHT bills of an order with their allocation as Map(lineId -> share). */
export async function loadFreight(tx, purchaseOrderId) {
  const bills = await tx.supplierBill.findMany({
    where: { purchaseOrderId, kind: "FREIGHT" },
    select: { id: true, amount: true, freightAllocation: true, freightCapitalised: true },
    orderBy: { createdAt: "asc" },
  });
  return bills.map((b) => ({
    ...b,
    shares: new Map((Array.isArray(b.freightAllocation) ? b.freightAllocation : []).map((r) => [r.lineId, d(r.amount)])),
    added: 0,
  }));
}

/** Freight share of a cumulative received quantity of a line (exact over the whole line). */
function shareUpTo(share, received, quantity) {
  return divRound(BigInt(share) * BigInt(received), quantity);
}

/** Freight (dirhams) carried by receiving `qty` more of `line` that already had `prev`; tallies per bill. */
export function freightForReceipt(freight, line, prev, qty) {
  let total = 0;
  for (const bill of freight) {
    const share = bill.shares.get(line.id) || 0;
    if (!share) continue;
    const add = shareUpTo(share, prev + qty, line.quantity) - shareUpTo(share, prev, line.quantity);
    bill.added += add;
    total += add;
  }
  return total;
}

/** Unit cost with freight: per piece, or per kg for weight goods (qty in grams). */
export function landedUnitCost(unitCost, qty, sellBy, extra) {
  if (!extra) return d(unitCost);
  const scale = sellBy === "WEIGHT" ? 1000n : 1n;
  return divRound(BigInt(d(unitCost)) * BigInt(qty) + BigInt(extra) * scale, qty);
}

export async function saveFreightAdded(tx, freight) {
  for (const bill of freight) {
    if (bill.added) await tx.supplierBill.update({ where: { id: bill.id }, data: { freightCapitalised: { increment: bill.added } } });
  }
}

/**
 * A freight bill added after goods were received: the share of what was received goes into the
 * unit cost of what is still on hand (up to the received quantity); the rest is freight on goods
 * already sold. Returns { capitalised, expensed, lines }.
 */
export async function capitaliseReceivedFreight(tx, { order, allocation, sellBy }) {
  const picks = order.lines
    .filter((l) => l.quantityReceived > 0 && allocation.get(l.id))
    .map((l) => ({ line: l, branchId: order.branchId, productId: l.productId, variantId: l.variantId }))
    .sort((a, b) => stockRowKey(a).localeCompare(stockRowKey(b)));
  let capitalised = 0;
  let expensed = 0;
  const lines = [];
  for (const p of picks) {
    const received = p.line.quantityReceived;
    const share = shareUpTo(allocation.get(p.line.id), received, p.line.quantity);
    if (!share) continue;
    const row = await lockStockRow(tx, p);
    const onHand = Math.max(0, Number(row.quantity) || 0);
    const onHandPart = onHand >= received ? share : divRound(BigInt(share) * BigInt(onHand), received);
    if (onHand > 0 && onHandPart > 0) {
      const weight = sellBy.get(p.productId) === "WEIGHT";
      const oldCost = row.unitCost != null ? d(row.unitCost) : d(p.line.unitCost);
      const unitCost = divRound(BigInt(oldCost) * BigInt(onHand) + BigInt(onHandPart) * (weight ? 1000n : 1n), onHand);
      if (p.variantId) await tx.variantStock.update({ where: { id: row.id }, data: { unitCost } });
      else await tx.inventory.update({ where: { id: row.id }, data: { unitCost } });
      lines.push({ lineId: p.line.id, onHand, oldCost, unitCost });
    }
    capitalised += onHand > 0 ? onHandPart : 0;
    expensed += share - (onHand > 0 ? onHandPart : 0);
  }
  return { capitalised, expensed, lines };
}

/** Splits a freight amount over the order lines by line value. */
export function freightAllocation(order, sellBy, amount) {
  const values = order.lines.map((l) => lineAmount(l.unitCost, l.quantity, sellBy.get(l.productId)));
  if (values.every((v) => v <= 0)) throw fail(400, "FREIGHT_NO_VALUE", "لا توجد قيمة على أسطر الأمر لتوزيع الشحن عليها", "The order lines have no value to spread the freight over");
  const parts = splitProportional(amount, values);
  return order.lines.map((l, i) => ({ lineId: l.id, amount: parts[i] }));
}

/** Money summary of one purchase order (dirhams): value, received, billed, paid, prepaid, freight. */
export function poMoney(order, sellBy) {
  const value = orderValue(order, sellBy);
  const received = (order.lines || []).reduce((s, l) => s + lineAmount(l.unitCost, l.quantityReceived, sellBy.get(l.productId)), 0);
  const goods = (order.bills || []).filter((b) => b.kind !== "FREIGHT");
  const freight = (order.bills || []).filter((b) => b.kind === "FREIGHT");
  const billed = goods.reduce((s, b) => s + d(b.amount), 0);
  const billPaid = goods.reduce((s, b) => s + d(b.amountPaid), 0);
  const prepaid = (order.prepayments || []).reduce((s, p) => s + d(p.amount), 0);
  const prepaidUnapplied = (order.prepayments || []).reduce((s, p) => s + d(p.amount) - d(p.amountApplied), 0);
  // Cash actually paid for the goods: bill payments (without applied prepayments) + prepayments.
  const applied = (order.prepayments || []).reduce((s, p) => s + d(p.amountApplied), 0);
  const paid = billPaid - applied + prepaid;
  return {
    value,
    received,
    billed,
    paid,
    prepaid,
    prepaidUnapplied,
    owed: billed - billPaid,
    paidStatus: paid <= 0 ? "UNPAID" : paid >= value ? "PAID" : "PART_PAID",
    freight: freight.reduce((s, b) => s + d(b.amount), 0),
    freightPaid: freight.reduce((s, b) => s + d(b.amountPaid), 0),
  };
}
