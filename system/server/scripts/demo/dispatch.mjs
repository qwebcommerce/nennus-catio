/**
 * fix-rb demo: delivery and grooming vans with drivers, assigned orders in several states
 * (assigned, accepted, delivered), one pending and one approved driver change request, and
 * home grooming visits assigned to grooming vans (one closed). Everything goes through the API,
 * so every row is recorded and removed with the rest of the demo.
 *
 * The two sales vans of the main demo are delivery vans (their staff use the driver dashboard);
 * this adds two more delivery vans and three grooming vans (4 delivery + 3 grooming).
 */
import crypto from "crypto";

const VANS = [
  { key: "van3", name: "سيارة التوصيل 3", nameEn: "Delivery van 3", type: "DELIVERY", vehicle: "Toyota Hiace – Van 3", plate: "DEMO 61942", driver: ["سانجاي ناير", "Sanjay Nair", "demo.driver3@example.com"] },
  { key: "van4", name: "سيارة التوصيل 4", nameEn: "Delivery van 4", type: "DELIVERY", vehicle: "Nissan Urvan – Van 4", plate: "DEMO 70385", driver: ["عمر حسن", "Omar Hassan", "demo.driver4@example.com"] },
  { key: "groom1", name: "سيارة التجميل 1", nameEn: "Grooming van 1", type: "GROOMING", vehicle: "Ford Transit – Groom 1", plate: "DEMO 81207", driver: ["ليا مندوزا", "Lea Mendoza", "demo.groomer1@example.com"] },
  { key: "groom2", name: "سيارة التجميل 2", nameEn: "Grooming van 2", type: "GROOMING", vehicle: "Ford Transit – Groom 2", plate: "DEMO 81563", driver: ["فاطمة علي", "Fatima Ali", "demo.groomer2@example.com"] },
  { key: "groom3", name: "سيارة التجميل 3", nameEn: "Grooming van 3", type: "GROOMING", vehicle: "Ford Transit – Groom 3", plate: "DEMO 81990", driver: ["جون ريس", "John Reyes", "demo.groomer3@example.com"] },
];

export function planDispatchDemo(h) {
  const { at, api, owner, S, L, ctx, basket, addStock, qDay } = h;
  const D = (S.dispatch = { van: {}, vehicle: {}, driver: {}, tok: {}, keys: {} });
  const tok = (id) => ctx.signToken({ sub: id, typ: "staff", organizationId: ctx.org.id, sv: 0 });
  const supTok = () => D.tok.supervisor || owner;
  const areaId = (nameEn) => S.area?.[nameEn] || null;
  /** A driver action as the van's own staff, or as the owner on that van when it has no account. */
  const driverCall = async (van, key, action, body = {}) => {
    const it = await api("GET", `/api/dispatch/items/${key}`, null, supTok());
    const who = D.tok[van] || owner;
    const q = D.tok[van] ? "" : `?vehicleId=${D.vehicle[van]}`;
    return api("POST", `/api/driver/jobs/${it.jobId}/${action}${q}`, { version: it.version, ...body }, who);
  };

  // ---- vans, vehicles, drivers, supervisor / accountant (day -3)
  at(-3, "07:45", "dispatch setup vans and drivers", async () => {
    for (const v of VANS) {
      D.van[v.key] = (await api("POST", "/api/branches", { name: v.name, nameEn: v.nameEn, kind: "VAN" }, owner)).id;
      D.vehicle[v.key] = (await api("POST", "/api/vehicles", { name: v.vehicle, plate: v.plate, branchId: D.van[v.key], type: v.type }, owner)).id;
    }
    // Staff accounts: random passwords nobody knows. The plan's user limit may stop some; the owner
    // then does that work (opening the van with ?vehicleId=).
    const person = async (key, role, [name, nameEn, email], branchId) => {
      const r = await api("POST", "/api/users", { email, password: crypto.randomBytes(24).toString("base64url"), name, nameEn, role, branchId }, owner, { raw: true });
      if (r.status !== 201) {
        // fix-ra: the main demo already creates the accountant and supervisor (demo/content.mjs STAFF).
        if (ctx.tokens[key] && S.staff?.[key]) {
          D.tok[key] = ctx.tokens[key];
          return S.staff[key];
        }
        return null;
      }
      D.tok[key] = tok(r.json.id);
      return r.json.id;
    };
    for (const v of VANS) D.driver[v.key] = await person(v.key, "DRIVER", v.driver, D.van[v.key]);
    await person("accountant", "ACCOUNTANT", ["بيتر جوزيف", "Peter Joseph", "demo.accountant@example.com"], L.shop);
    await person("supervisor", "SUPERVISOR", ["هالة منصور", "Hala Mansour", "demo.supervisor@example.com"], L.shop);
    // The main demo's sales vans: their vehicles and staff (DRIVER on a van) are delivery drivers too.
    const vehicles = await api("GET", "/api/vehicles", null, owner);
    for (const k of ["van1", "van2"]) {
      D.vehicle[k] = vehicles.find((v) => v.branchId === L[k])?.id;
      D.tok[k] = ctx.tokens[k] || null;
      if (S.staff?.[k]) D.driver[k] = S.staff[k];
    }
  });

  // ---- orders to deliver (day -1): two sales orders and two till sales for delivery
  const soLines = (n, qty) => S.items.filter((it) => it.takesStock && !it.isHouse && it.sellBy !== "WEIGHT" && it.price >= 2000).slice(0, n).map((it) => ({ productId: it.productId, variantId: it.variantId, quantity: qty }));
  const salesOrder = (key, customer, lines, zoneArea, address) => async () => {
    const o = await api("POST", "/api/sales-orders", { customerId: S.b2b[customer], branchId: L.warehouse, deliveryDate: qDay(1), note: "Demo delivery order", lines }, owner);
    await api("POST", `/api/sales-orders/${o.id}/confirm`, { version: o.version }, owner);
    D.keys[key] = `SALES_ORDER:${o.id}`;
    await api("PATCH", `/api/dispatch/items/${D.keys[key]}`, { areaId: areaId(zoneArea), address }, supTok());
  };
  at(-1, "08:30", "dispatch sales order A", salesOrder("soA", "pearl", soLines(2, 2), "The Pearl", "Pearl Vet Clinic, Porto Arabia, Tower 12"));
  at(-1, "08:35", "dispatch sales order B", salesOrder("soB", "dohaVets", soLines(1, 3), "Al Sadd", "Doha Animal Hospital, Al Sadd Street"));
  const tillDelivery = (key, area, address) => async () => {
    const lines = basket(S, L.shop, 1, { weight: false, keep: 6 });
    if (!lines.length) return;
    const customer = Object.values(S.customers || {})[0]?.id || S.b2b.lusail;
    for (const l of lines) addStock(S, L.shop, l.item, -l.quantity);
    try {
      const sale = await api("POST", "/api/sales/checkout", {
        branchId: L.shop, customerId: customer, paymentMethod: "CARD", clientMutationId: `demo-${crypto.randomUUID()}`,
        items: lines.map((l) => ({ productId: l.item.productId, variantId: l.item.variantId, quantity: l.quantity })),
        forDelivery: true, deliveryAddress: address, deliveryAreaId: areaId(area), deliveryDate: qDay(-1),
      }, ctx.tokens.cashier || owner);
      D.keys[key] = `POS_DELIVERY:${sale.id}`;
    } catch (e) {
      for (const l of lines) addStock(S, L.shop, l.item, l.quantity);
      throw e;
    }
  };
  at(-1, "09:05", "dispatch till delivery 1", tillDelivery("pos1", "West Bay", "Zone 61, Street 830, Villa 14"));
  at(-1, "09:25", "dispatch till delivery 2", tillDelivery("pos2", "Lusail", "Fox Hills, Building 22, Flat 5"));

  // ---- assign (supervisor), accept, change requests, deliver
  const assign = (key, van) => async () => {
    if (!D.keys[key] || !D.vehicle[van]) return;
    const body = { keys: [D.keys[key]], ...(D.driver[van] ? { driverUserId: D.driver[van] } : { vehicleId: D.vehicle[van] }), note: "Demo run" };
    await api("POST", "/api/dispatch/assign", body, supTok());
  };
  at(-1, "10:00", "dispatch assign SO A to van 1", assign("soA", "van1"));
  at(-1, "10:01", "dispatch assign SO B to van 3", assign("soB", "van3"));
  at(-1, "10:02", "dispatch assign till delivery 1 to van 1", assign("pos1", "van1"));
  at(-1, "10:03", "dispatch assign till delivery 2 to van 4", assign("pos2", "van4"));
  const accept = (key, van) => async () => {
    if (!D.keys[key]) return;
    await driverCall(van, D.keys[key], "accept");
  };
  at(-1, "10:20", "dispatch van 1 accepts SO A", accept("soA", "van1"));
  at(-1, "10:21", "dispatch van 1 accepts till delivery 1", accept("pos1", "van1"));
  at(-1, "10:25", "dispatch van 3 accepts SO B", accept("soB", "van3"));
  // pending request: van 1 asks for one bag less on SO A
  at(-1, "11:00", "dispatch change request SO A (pending)", async () => {
    if (!D.keys.soA) return;
    const it = await api("GET", `/api/dispatch/items/${D.keys.soA}`, null, supTok());
    const l = it.lines[0];
    await driverCall("van1", D.keys.soA, "change-requests", { lines: [{ lineId: l.id, quantity: Math.max(1, l.quantity - 1) }], reason: "Clinic asked for one bag less at the door" });
  });
  // approved request: van 3 changes SO B to 2 and the delivery entrance; the supervisor approves (fix-ra: 30-user limit)
  at(-1, "11:10", "dispatch change request SO B", async () => {
    if (!D.keys.soB) return;
    const it = await api("GET", `/api/dispatch/items/${D.keys.soB}`, null, supTok());
    D.requestB = await driverCall("van3", D.keys.soB, "change-requests", { lines: [{ lineId: it.lines[0].id, quantity: 2 }], address: "Doha Animal Hospital, back entrance (Gate 3)", reason: "Hospital storeroom has room for two cartons" });
  });
  at(-1, "11:40", "dispatch supervisor approves SO B change", async () => {
    if (!D.requestB) return;
    await api("POST", `/api/driver-approvals/${D.requestB.id}/approve`, { version: D.requestB.version, note: "OK – invoice follows the new quantity" }, D.tok.supervisor || owner);
  });
  at(-1, "13:15", "dispatch van 1 delivers till delivery 1", async () => {
    if (!D.keys.pos1) return;
    await driverCall("van1", D.keys.pos1, "deliver");
  });

  // ---- home grooming visits on grooming vans (optional: grooming hours may be full)
  const svc = () => Object.values(S.pkg || {})[0]?.id;
  const home = (key, day, time, petName, area, address) => async () => {
    const customer = Object.values(S.customers || {})[1]?.id || S.b2b.pearl;
    const startAt = new Date(`${qDay(day)}T${time}:00+03:00`).toISOString();
    const b = await api("POST", "/api/appointments", { branchId: L.shop, customerId: customer, serviceId: svc(), petName, petType: "CAT", startAt, visitKind: "HOME", address, areaId: areaId(area), notes: "Demo home visit" }, owner);
    D.keys[key] = `GROOMING:${b.id}`;
  };
  at(-1, "08:10", "dispatch home grooming booking 1", home("g1", -1, "17:00", "Simba", "Al Rayyan", "Al Rayyan, Street 12, Villa 3"), { optional: true });
  at(-1, "08:12", "dispatch home grooming booking 2", home("g2", 1, "16:30", "Bella", "Al Wakrah", "Al Wakrah, Street 40, Villa 9"), { optional: true });
  const assignGroom = (key, van) => async () => {
    if (!D.keys[key]) return;
    await api("POST", "/api/dispatch/assign", { keys: [D.keys[key]], vehicleId: D.vehicle[van] }, supTok());
  };
  at(-1, "08:20", "dispatch assign grooming 1 to groom 1", assignGroom("g1", "groom1"), { optional: true });
  at(-1, "08:21", "dispatch assign grooming 2 to groom 2", assignGroom("g2", "groom2"), { optional: true });
  at(-1, "18:05", "dispatch groom 1 closes the visit", async () => {
    if (!D.keys.g1) return;
    await driverCall("groom1", D.keys.g1, "booking-status", { status: "DONE" });
  }, { optional: true });
}
