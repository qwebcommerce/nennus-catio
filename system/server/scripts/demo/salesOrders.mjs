/**
 * Demo timeline for sales orders, free (complimentary) till goods, bank transfers, and a purchase
 * order with an attached quotation, a prepayment and a freight bill (landed cost).
 * Everything goes through the API like the rest of the demo, so every row is recorded and removed.
 *
 * Sales orders sell from the warehouse (the B2B location); their deliveries take warehouse stock,
 * which is kept in the loader's stock map so later transfers stay right.
 */

/** A small valid PDF (the "supplier quotation" / transfer receipt). */
export function demoPdf(title) {
  const text = String(title).replace(/[()\\]/g, " ");
  const stream = `BT /F1 14 Tf 40 760 Td (${text}) Tj ET`;
  const objs = [
    "<</Type/Catalog/Pages 2 0 R>>",
    "<</Type/Pages/Kids[3 0 R]/Count 1>>",
    "<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>",
    `<</Length ${stream.length}>>\nstream\n${stream}\nendstream`,
    "<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>",
  ];
  let out = "%PDF-1.4\n";
  const offsets = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

export function planSalesOrdersDemo(h) {
  const { at, api, owner, S, L, addStock, onHand, basket, qDay, riyals, upload } = h;
  // fix-rd: the owner records payments; the accountant confirms them (scripts/demo/payments.mjs).
  const confirm = async (r) => { if (h.confirm && r?.payment?.id) await h.confirm(`SO_PAYMENT:${r.payment.id}`); };
  const so = {};
  const piece = () => S.items.filter((it) => it.takesStock && !it.isHouse && it.sellBy !== "WEIGHT" && it.price >= 2000);
  /** n lines the warehouse can still give (keeps 3 back for transfers). */
  const pickLines = (n, qty) => {
    const out = [];
    for (const it of piece()) {
      if (out.length >= n) break;
      if (onHand(S, L.warehouse, it) - 3 >= qty) out.push({ item: it, quantity: qty });
    }
    return out;
  };
  const proof = async (title) => (await upload("/api/files", demoPdf(title), `${title}.pdf`, "application/pdf", owner)).id;

  const create = (key, customer, lines, { plan, deliveryDay, terms, discount, freeLine, freeReason } = {}) => async () => {
    const chosen = pickLines(lines.length + (freeLine ? 1 : 0), Math.max(...lines));
    if (chosen.length < lines.length + (freeLine ? 1 : 0)) throw new Error(`sales order ${key}: not enough warehouse stock for the demo lines`);
    const body = {
      customerId: S.b2b[customer],
      branchId: L.warehouse,
      deliveryDate: qDay(deliveryDay),
      paymentTerms: terms,
      discountAmount: discount,
      note: "Demo B2B order",
      lines: lines.map((q, i) => ({ productId: chosen[i].item.productId, variantId: chosen[i].item.variantId, quantity: q })),
      plan,
    };
    if (freeLine) {
      const f = chosen[lines.length];
      body.lines.push({ productId: f.item.productId, variantId: f.item.variantId, quantity: 1, isFree: true });
      body.freeReason = freeReason;
    }
    const order = await api("POST", "/api/sales-orders", body, owner);
    const confirmed = await api("POST", `/api/sales-orders/${order.id}/confirm`, { version: order.version }, owner);
    so[key] = { id: order.id, total: Number(confirmed.total), lines: confirmed.lines };
  };
  const pay = (key, amount, method, reference) => async () => {
    if (!so[key]) return;
    const body = { amount: amount === "all" ? riyals(Math.round(so[key].total * 100)) : amount, method, reference };
    if (method === "BANK_TRANSFER") body.proofFileId = await proof(`Transfer ${reference}`);
    await confirm(await api("POST", `/api/sales-orders/${so[key].id}/payments`, body, owner));
  };
  const deliver = (key, share = 1) => async () => {
    if (!so[key]) return;
    const lines = so[key].lines
      .map((l) => ({ lineId: l.id, quantity: share === 1 ? l.quantityPending : Math.floor(l.quantityPending * share) }))
      .filter((l) => l.quantity > 0);
    const r = await api("POST", `/api/sales-orders/${so[key].id}/deliveries`, { lines }, owner);
    so[key].lines = r.order.lines;
    for (const l of lines) {
      const line = r.order.lines.find((x) => x.id === l.lineId);
      const it = S.items.find((x) => x.productId === line.productId && (x.variantId || null) === (line.variantId || null));
      if (it) addStock(S, L.warehouse, it, -l.quantity);
    }
  };

  /** Pays exactly the first open installment. */
  const payFirst = (key, method, reference) => async () => {
    if (!so[key]) return;
    const order = await api("GET", `/api/sales-orders/${so[key].id}`, null, owner);
    const first = order.installments.find((i) => Number(i.owed) > 0);
    if (!first) return;
    const body = { amount: first.owed, method, reference };
    if (method === "BANK_TRANSFER") body.proofFileId = await proof(`Transfer ${reference}`);
    await confirm(await api("POST", `/api/sales-orders/${order.id}/payments`, body, owner));
  };

  // Business customers.
  S.b2b = {};
  const company = (key, name, companyName, phone) => async () => {
    S.b2b[key] = (await api("POST", "/api/customers", { name, companyName, isBusiness: true, phone, email: `${key}@example.com` }, owner)).id;
  };
  at(-29, "08:40", "set B2B customer pearl", company("pearl", "Ahmed Al-Kuwari", "Pearl Vet Clinic WLL", "+974 5550 1201"));
  at(-29, "08:42", "set B2B customer lusail", company("lusail", "Maria Santos", "Lusail Pet Hotel", "+974 5550 1202"));
  at(-29, "08:44", "set B2B customer doha", company("dohaVets", "Khalid Rahman", "Doha Animal Hospital", "+974 5550 1203"));

  // 1) 50% paid, second installment overdue.
  at(-26, "11:00", "set sales order SO1", create("so1", "pearl", [6, 4], {
    plan: [{ percent: 50, dueDate: qDay(-26) }, { percent: 50, dueDate: qDay(-12) }],
    deliveryDay: -24, terms: "50% now, 50% in 14 days",
  }));
  at(-26, "11:20", "set SO1 deposit", payFirst("so1", "BANK_TRANSFER", "QNB-SO1-001"));
  at(-24, "09:30", "set SO1 delivery", deliver("so1"));
  // 2) fully paid, not delivered yet.
  at(-6, "10:00", "set sales order SO2", create("so2", "lusail", [3, 2], { plan: [], deliveryDay: 4, terms: "Paid in advance" }));
  at(-6, "10:15", "set SO2 payment", pay("so2", "all", "BANK_TRANSFER", "CBQ-SO2-778"));
  // 3) delivered, not paid (net 30).
  at(-9, "12:00", "set sales order SO3", create("so3", "dohaVets", [3], { plan: [{ percent: 100, dueDate: qDay(21) }], deliveryDay: -8, terms: "Net 30", discount: "5.00" }));
  at(-8, "09:00", "set SO3 delivery (part)", deliver("so3", 0.5));
  at(-7, "09:00", "set SO3 delivery (rest)", deliver("so3"));
  // 4) with a free line, two installments, half delivered.
  at(-4, "15:00", "set sales order SO4", create("so4", "pearl", [4], {
    plan: [{ percent: 40, dueDate: qDay(-4) }, { percent: 60, dueDate: qDay(10) }],
    deliveryDay: -2, terms: "40% deposit, rest on delivery", freeLine: true, freeReason: "Sample for the clinic's new waiting room",
  }));
  at(-4, "15:10", "set SO4 deposit", payFirst("so4", "CARD", "POS-4471"));
  at(-2, "09:00", "set SO4 delivery (part)", deliver("so4", 0.5));

  // ---- till: free goods (owner = manager rights) and bank transfers
  const tillSale = (day, time, label, { free = "none", method = "CARD", reference } = {}) =>
    at(day, time, `shop sale ${label}`, async () => {
      const lines = basket(S, L.shop, free === "all" ? 1 : 2, { weight: false, keep: 6 });
      if (!lines.length) return;
      const body = {
        branchId: L.shop,
        paymentMethod: method,
        items: lines.map((l, i) => ({ productId: l.item.productId, variantId: l.item.variantId, quantity: l.quantity, ...(free === "line" && i === lines.length - 1 ? { isFree: true } : {}) })),
      };
      if (free !== "none") body.freeReason = free === "all" ? "Giveaway for a pet adoption day" : "Free sample with the order";
      if (free === "all") body.complimentary = true;
      if (reference) body.paymentReference = reference;
      for (const l of lines) addStock(S, L.shop, l.item, -l.quantity);
      try {
        await api("POST", "/api/sales/checkout", body, owner);
      } catch (e) {
        for (const l of lines) addStock(S, L.shop, l.item, l.quantity);
        throw e;
      }
    });
  tillSale(-19, "12:30", "free line -19", { free: "line", method: "CARD" });
  tillSale(-11, "17:05", "free invoice -11", { free: "all", method: "CARD" });
  tillSale(-3, "13:40", "free line -3", { free: "line", method: "BANK_TRANSFER", reference: "DB-TRF-20931" });
  tillSale(-14, "11:15", "bank transfer -14", { method: "BANK_TRANSFER", reference: "QNB-TRF-71123" });
  tillSale(-5, "16:20", "bank transfer -5", { method: "BANK_TRANSFER" });

  // ---- purchase order with quotation, prepayment and freight (landed cost)
  const po = {};
  at(-10, "08:20", "set freight company", async () => {
    S.freightCo = (await api("POST", "/api/suppliers", { name: "Gulf Freight Services", phone: "+974 4400 7788", email: "ops@gulf-freight.example.com", isFreight: true, paymentTermsDays: 15 }, owner)).id;
  });
  at(-9, "09:00", "PO imported treats (quotation)", async () => {
    const lines = piece().slice(0, 2).map((it) => ({ productId: it.productId, variantId: it.variantId, quantity: 12, unitCost: riyals(it.cost) }));
    const order = await api("POST", "/api/purchase-orders", {
      supplierId: S.supplier.gulfPet, branchId: L.warehouse, note: "Imported treats – quotation attached",
      expectedDate: qDay(-6), paymentTermsDays: 30, lines,
    }, owner);
    await upload(`/api/purchase-orders/${order.id}/attachments`, demoPdf(`Quotation Q-2026-118 Gulf Pet Supply`), "Quotation Q-2026-118.pdf", "application/pdf", owner);
    const sent = await api("POST", `/api/purchase-orders/${order.id}/send`, { version: order.version }, owner);
    po.id = order.id;
    po.lines = sent.lines;
    po.value = lines.reduce((s, l) => s + Math.round(Number(l.unitCost) * 100) * l.quantity, 0);
  });
  at(-9, "09:30", "pay PO prepayment (deposit)", async () => {
    if (!po.id) return;
    const amount = riyals(Math.floor(po.value / 2));
    await api("POST", `/api/purchase-orders/${po.id}/prepayments`, { amount, method: "BANK", reference: "QNB-DEP-3301", proofFileId: await proof("Deposit QNB-DEP-3301") }, owner);
  });
  at(-8, "10:00", "PO freight bill", async () => {
    if (!po.id || !S.freightCo) return;
    await api("POST", `/api/purchase-orders/${po.id}/freight`, { freightCompanyId: S.freightCo, amount: "84.00", reference: "AWB 176-55441230", dueDate: qDay(7), proofFileId: await proof("Freight invoice AWB 176-55441230") }, owner);
  });
  at(-6, "11:00", "receive imported treats", async () => {
    if (!po.id) return;
    await api("POST", `/api/purchase-orders/${po.id}/receive`, { lines: po.lines.map((l) => ({ id: l.id, quantity: l.quantity })) }, owner);
    for (const l of po.lines) {
      const it = S.items.find((x) => x.productId === l.productId && (x.variantId || null) === (l.variantId || null));
      if (it) addStock(S, L.warehouse, it, l.quantity);
    }
  });
  at(-5, "12:00", "pay freight bill", async () => {
    if (!po.id) return;
    const bills = await api("GET", `/api/purchase-orders/bills?supplierId=${S.freightCo}&open=1`, null, owner);
    for (const b of bills) await api("POST", `/api/purchase-orders/bills/${b.id}/payments`, { amount: b.owed, method: "CASH", note: "Paid to driver" }, owner);
  });
}
