/**
 * fix-rd demo: accountant confirmation of collected money (docs/testing/payment-confirmation.md).
 *  - every sales-order payment and B2B receipt of the demo is confirmed by someone other than the
 *    person who recorded it (the accountant for the owner's payments, the supervisor for the
 *    accountant's receipts) — see confirmLater();
 *  - one sales-order payment recorded twice by mistake is rejected (with the reason);
 *  - left awaiting confirmation: a B2B cash receipt collected by van driver 1, van 1's cash on
 *    delivery for a till sale paid on delivery, and a customer account collection by bank transfer.
 * Everything goes through the API, so every row is recorded and removed with the rest of the demo.
 */
import crypto from "crypto";
import { demoPdf } from "./salesOrders.mjs";

/** Confirms (or rejects) one queue row as `token`. Missing rows / rights are left as they are. */
export async function decidePayment(api, token, key, decision = "confirm", reason) {
  const row = await api("GET", `/api/payment-confirmations/${encodeURIComponent(key)}`, null, token);
  if (row.status !== "PENDING_CONFIRMATION") return row;
  return api("POST", `/api/payment-confirmations/${encodeURIComponent(key)}/${decision}`, { version: row.version, ...(reason ? { reason } : {}) }, token);
}

export function planPaymentConfirmDemo(h) {
  const { at, api, T, owner, S, L, ctx, basket, addStock, qDay, upload } = h;
  const as = (who) => T[who] || owner;
  const D = () => S.dispatch || { tok: {}, keys: {}, vehicle: {}, driver: {} };

  // ---- a sales-order payment recorded twice by mistake: the accountant rejects the duplicate.
  at(-4, "15:10", "set payment duplicate (rejected)", async () => {
    const orders = await api("GET", "/api/sales-orders", null, owner);
    const open = (Array.isArray(orders) ? orders : orders.rows || []).find((o) => o.orderType !== "B2B" && ["CONFIRMED", "PARTLY_DELIVERED", "DELIVERED"].includes(o.status) && Number(o.openToCollect ?? o.balance) >= 10);
    if (!open) return;
    const r = await api("POST", `/api/sales-orders/${open.id}/payments`, { amount: "10.00", method: "CASH", note: "Entered twice by mistake" }, owner);
    await decidePayment(api, as("accountant"), `SO_PAYMENT:${r.payment.id}`, "reject", "Duplicate entry: the same cash was already recorded");
  });

  // ---- B2B: part of the unpaid invoice collected in cash by van driver 1, awaiting confirmation.
  at(-2, "16:20", "set B2B receipt awaiting confirmation", async () => {
    const invoices = await api("GET", "/api/b2b/invoices?status=ISSUED", null, as("accountant"));
    const inv = (Array.isArray(invoices) ? invoices : invoices.rows || [])[0];
    if (!inv) return;
    const amount = (Math.floor(Math.round(Number(inv.balance) * 100) / 4) / 100).toFixed(2);
    if (Number(amount) <= 0) return;
    await api("POST", `/api/b2b/invoices/${inv.id}/receipts`, { amount, method: "CASH", collectedById: S.staff.van1 || undefined, note: "Cash collected on the delivery round" }, as("accountant"));
  });

  // ---- a credit customer pays part of the account by bank transfer (awaiting confirmation).
  at(-2, "11:30", "set credit customer and on-account sale", async () => {
    S.creditCustomer = (await api("POST", "/api/customers", { name: "Hamad Al-Sulaiti", phone: "+974 5550 1401", creditApproved: true, creditLimit: "2000", address: "Al Gharrafa, Doha" }, owner)).id;
    const lines = basket(S, L.shop, 1, { weight: false, keep: 6 });
    if (!lines.length) return;
    for (const l of lines) addStock(S, L.shop, l.item, -l.quantity);
    try {
      await api("POST", "/api/sales/checkout", {
        branchId: L.shop, customerId: S.creditCustomer, paymentMethod: "ON_ACCOUNT", clientMutationId: `demo-${crypto.randomUUID()}`,
        items: lines.map((l) => ({ productId: l.item.productId, variantId: l.item.variantId, quantity: l.quantity })),
      }, as("cashier"));
    } catch (e) {
      for (const l of lines) addStock(S, L.shop, l.item, l.quantity);
      throw e;
    }
  });
  at(-1, "12:15", "set account collection awaiting confirmation", async () => {
    if (!S.creditCustomer) return;
    const c = await api("GET", `/api/customer-accounts/${S.creditCustomer}/ledger`, null, as("accountant"));
    const half = (Math.floor(Math.round(Number(c.customer.accountBalance) * 100) / 2) / 100).toFixed(2);
    if (Number(half) <= 0) return;
    const proofFileId = (await upload("/api/files", demoPdf("Transfer CB-77120"), "CB-77120.pdf", "application/pdf", as("accountant"))).id;
    await api("POST", `/api/customer-accounts/${S.creditCustomer}/payments`, { amount: half, paymentMethod: "BANK_TRANSFER", reference: "CB-77120", proofFileId, branchId: L.shop, note: "Part payment" }, as("accountant"));
  });

  // ---- van 1: a till sale paid on delivery; the driver records the cash (awaiting confirmation).
  at(-1, "09:40", "dispatch till delivery paid on delivery", async () => {
    const lines = basket(S, L.shop, 1, { weight: false, keep: 6 });
    if (!lines.length) return;
    const customer = Object.values(S.customers || {})[2]?.id || Object.values(S.customers || {})[0]?.id;
    for (const l of lines) addStock(S, L.shop, l.item, -l.quantity);
    try {
      const sale = await api("POST", "/api/sales/checkout", {
        branchId: L.shop, customerId: customer, paymentMethod: "ON_DELIVERY", clientMutationId: `demo-${crypto.randomUUID()}`,
        items: lines.map((l) => ({ productId: l.item.productId, variantId: l.item.variantId, quantity: l.quantity })),
        forDelivery: true, deliveryAddress: "Al Waab, Street 9, Villa 21", deliveryDate: qDay(-1),
      }, as("cashier"));
      D().keys.cod = `POS_DELIVERY:${sale.id}`;
    } catch (e) {
      for (const l of lines) addStock(S, L.shop, l.item, l.quantity);
      throw e;
    }
  });
  const supTok = () => D().tok.supervisor || owner;
  const driverCall = async (key, action, body = {}) => {
    const it = await api("GET", `/api/dispatch/items/${key}`, null, supTok());
    const who = D().tok.van1 || owner;
    const q = D().tok.van1 ? "" : `?vehicleId=${D().vehicle.van1}`;
    return api("POST", `/api/driver/jobs/${it.jobId}/${action}${q}`, { version: it.version, ...body }, who);
  };
  at(-1, "10:04", "dispatch assign paid-on-delivery sale to van 1", async () => {
    const key = D().keys.cod;
    if (!key || !D().vehicle.van1) return;
    await api("POST", "/api/dispatch/assign", { keys: [key], ...(D().driver.van1 ? { driverUserId: D().driver.van1 } : { vehicleId: D().vehicle.van1 }), note: "Cash on delivery" }, supTok());
  });
  at(-1, "10:22", "dispatch van 1 accepts the paid-on-delivery sale", async () => {
    if (D().keys.cod) await driverCall(D().keys.cod, "accept");
  });
  at(-1, "15:30", "dispatch van 1 delivers and records the cash", async () => {
    const key = D().keys.cod;
    if (!key) return;
    await driverCall(key, "deliver");
    const it = await api("GET", `/api/dispatch/items/${key}`, null, supTok());
    if (Number(it.toCollect) > 0) await driverCall(key, "collect", { amount: it.toCollect, method: "CASH", note: "Cash on delivery" });
  });
}
