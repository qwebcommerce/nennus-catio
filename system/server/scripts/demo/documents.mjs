/**
 * fix-rg demo: one example of each "paid / delivered" situation (docs/testing/printable-documents.md).
 * Most come from earlier demo steps (scripts/demo/salesOrders.mjs, demo-data.mjs, b2b.mjs):
 *   - PO received, not paid ............ "Restock – litter and accessories" (partly received, unpaid)
 *   - PO received, part paid ........... "Weekly restock" (40% paid) and the imported treats (deposit)
 *   - SO paid in full, not delivered ... SO2 (Lusail Pet Hotel)
 *   - SO delivered, not paid ........... SO3 (Doha Animal Hospital)
 *   - SO partly paid / partly delivered  SO4 (Pearl Vet Clinic)
 *   - B2B note delivered and invoiced, no receipt (AB Trading, net 30)
 * Added here:
 *   - a purchase order paid in full in advance (bank transfer with proof), nothing received yet;
 *   - a sales order paid in full whose payment is still awaiting the accountant's confirmation,
 *     nothing delivered (shown as "awaiting confirmation", not counted as paid).
 * Everything goes through the API, so every row is recorded and removed with the rest of the demo.
 */
import { demoPdf } from "./salesOrders.mjs";

export function planDocumentsDemo(h) {
  const { at, api, owner, S, L, qDay, riyals, upload } = h;
  const pieces = (filter) => S.items.filter((it) => it.takesStock && !it.isHouse && it.sellBy !== "WEIGHT" && it.cost > 0 && filter(it));

  at(-2, "09:15", "PO prepaid in full, not received yet", async () => {
    const items = pieces((it) => it.supplier === "doha").slice(0, 2);
    if (!items.length || !S.supplier?.doha) return;
    const lines = items.map((it) => ({ productId: it.productId, variantId: it.variantId, quantity: 10, unitCost: riyals(it.cost) }));
    const order = await api("POST", "/api/purchase-orders", {
      supplierId: S.supplier.doha, branchId: L.warehouse, note: "Paid in advance – arriving next week",
      expectedDate: qDay(5), paymentTermsDays: 0, lines,
    }, owner);
    await api("POST", `/api/purchase-orders/${order.id}/send`, { version: order.version }, owner);
    const value = items.reduce((s, it) => s + it.cost * 10, 0);
    const proofFileId = (await upload("/api/files", demoPdf("Advance QNB-PP-4410"), "Advance QNB-PP-4410.pdf", "application/pdf", owner)).id;
    await api("POST", `/api/purchase-orders/${order.id}/prepayments`, { amount: riyals(value), method: "BANK", reference: "QNB-PP-4410", proofFileId }, owner);
  });

  at(-1, "11:30", "set sales order paid, awaiting confirmation", async () => {
    const it = pieces(() => true)[0];
    const customerId = S.b2b?.lusail;
    if (!it || !customerId) return;
    const order = await api("POST", "/api/sales-orders", {
      customerId, branchId: L.warehouse, deliveryDate: qDay(3), paymentTerms: "Paid in advance", note: "Demo: paid, waiting for the accountant",
      lines: [{ productId: it.productId, variantId: it.variantId, quantity: 2 }],
    }, owner);
    const confirmed = await api("POST", `/api/sales-orders/${order.id}/confirm`, { version: order.version }, owner);
    await api("POST", `/api/sales-orders/${order.id}/payments`, { amount: confirmed.total, method: "CASH", reference: "Cash at the warehouse" }, owner);
  });
}
