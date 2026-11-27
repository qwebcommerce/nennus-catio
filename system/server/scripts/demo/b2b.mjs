/**
 * Demo timeline for the B2B / Wholesale tab (fix-ra): one business customer with
 *  1) a delivery note invoiced and fully paid (bank transfer with proof, then cash collected by a van driver),
 *  2) a delivery note invoiced and unpaid (net 30),
 *  3) a delivery note delivered and not invoiced yet.
 * Notes sell from the warehouse; deliveries take its stock, kept in the loader's stock map.
 * Everything goes through the API, so every row is recorded and removed with the demo.
 */
import { demoPdf } from "./salesOrders.mjs";

export function planB2bDemo(h) {
  const { at, api, T, owner, S, L, addStock, onHand, qDay, upload } = h;
  const as = (who) => T[who] || owner;
  const notes = {};
  let invoice = null;
  const piece = () => S.items.filter((it) => it.takesStock && !it.isHouse && it.sellBy !== "WEIGHT" && it.price >= 2000);
  const pick = (n, qty) => {
    const out = [];
    for (const it of piece()) {
      if (out.length >= n) break;
      if (onHand(S, L.warehouse, it) - 3 >= qty) out.push(it);
    }
    return out;
  };

  at(-16, "08:50", "set B2B customer AB Trading", async () => {
    S.b2bAb = (await api("POST", "/api/customers", { name: "Yousef Al-Marri", companyName: "AB Trading W.L.L.", isBusiness: true, phone: "+974 5550 1301", email: "ab.trading@example.com" }, owner)).id;
  });
  const note = (key, day, time, qty, terms) =>
    at(day, time, `set B2B delivery note ${key}`, async () => {
      if (!S.b2bAb) return;
      const items = pick(2, qty);
      if (items.length < 2) throw new Error(`B2B note ${key}: not enough warehouse stock for the demo lines`);
      const body = {
        customerId: S.b2bAb,
        branchId: L.warehouse,
        deliveryDate: qDay(day),
        paymentTermsDays: terms,
        note: "Demo wholesale delivery",
        lines: items.map((it) => ({ productId: it.productId, variantId: it.variantId, quantity: qty })),
      };
      const created = await api("POST", "/api/b2b/delivery-notes", body, as("b2b"));
      notes[key] = created;
      for (const it of items) addStock(S, L.warehouse, it, -qty);
    });
  // 1) fully paid
  note("paid", -15, "09:10", 4, 7);
  at(-14, "10:00", "set B2B invoice (paid)", async () => {
    if (!notes.paid) return;
    invoice = await api("POST", "/api/b2b/invoices", { deliveryNoteIds: [notes.paid.id] }, as("b2b"));
  });
  at(-11, "11:30", "set B2B receipt bank transfer", async () => {
    if (!invoice) return;
    const half = (Math.floor(Math.round(Number(invoice.total) * 100) / 2) / 100).toFixed(2);
    const proofFileId = (await upload("/api/files", demoPdf("Transfer QNB-AB-4410"), "QNB-AB-4410.pdf", "application/pdf", as("accountant"))).id;
    const r = await api("POST", `/api/b2b/invoices/${invoice.id}/receipts`, { amount: half, method: "BANK_TRANSFER", bankReference: "QNB-AB-4410", proofFileId }, as("accountant"));
    // fix-rd: the accountant recorded it, so the supervisor confirms it.
    if (h.confirm) await h.confirm(`B2B_RECEIPT:${r.receipt.id}`, "supervisor");
    invoice = await api("GET", `/api/b2b/invoices/${invoice.id}`, null, as("accountant"));
  });
  at(-8, "16:40", "set B2B receipt cash by driver", async () => {
    if (!invoice) return;
    const r = await api("POST", `/api/b2b/invoices/${invoice.id}/receipts`, { amount: invoice.balance, method: "CASH", collectedById: S.staff.van1 || undefined, note: "Cash collected on the delivery round" }, as("accountant"));
    if (h.confirm) await h.confirm(`B2B_RECEIPT:${r.receipt.id}`, "supervisor");
  });
  // 2) invoiced, unpaid
  note("unpaid", -6, "09:20", 3, 30);
  at(-5, "10:10", "set B2B invoice (unpaid)", async () => {
    if (!notes.unpaid) return;
    await api("POST", "/api/b2b/invoices", { deliveryNoteIds: [notes.unpaid.id] }, as("b2b"));
  });
  // 3) delivered, not invoiced
  note("open", -2, "09:30", 2, 30);
}
