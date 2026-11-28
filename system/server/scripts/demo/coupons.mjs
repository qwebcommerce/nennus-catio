/**
 * fix-re demo: generated grooming coupons (docs/testing/coupons.md).
 *  - "Grooming coupons – November": 20 codes, 15% off the cat packages, website and desk.
 *    Three codes used on paid website bookings (two of them done), one used at the desk,
 *    one held by a website booking still waiting for payment (the live server's hold sweep
 *    gives it back once the hold ends).
 *  - "Summer grooming": 10 codes, 20.00 QAR off the dog basic package, ended last month.
 * Everything goes through the API, so removal finds the rows through DemoRecord / foreign keys.
 */
export function planCouponDemo(h) {
  const { at, api, owner, S, L, qDay, qAt, now, pay, staffCall } = h;
  const C = {};

  at(-21, "09:10", "set coupon batch (November)", async () => {
    const b = await api("POST", "/api/coupons", {
      name: "قسائم التجميل – نوفمبر", nameEn: "Grooming coupons – November", prefix: "GROOM",
      packageIds: [S.pkg.catBasic.id, S.pkg.catFull.id], discountType: "PERCENT", percent: 15,
      validFrom: qDay(-21), validUntil: qDay(30), codeCount: 20, channel: "BOTH",
    }, owner);
    C.batch = b.id;
    C.codes = (await api("GET", `/api/coupons/${b.id}`, null, owner)).codes.map((c) => c.code);
  });
  at(-21, "09:20", "set coupon batch (summer, expired)", async () => {
    await api("POST", "/api/coupons", {
      name: "قسائم الصيف", nameEn: "Summer grooming", prefix: "SUMMER",
      packageIds: [S.pkg.dogBasic.id], discountType: "AMOUNT", amount: "20.00",
      validFrom: qDay(-75), validUntil: qDay(-35), codeCount: 10, channel: "WEBSITE",
    }, owner);
  });

  /** A free website slot on the day (or up to 6 days earlier), nearest to the wanted time. */
  const slotNear = async (token, day0, time, pkg, { ahead = false } = {}) => {
    for (let back = 0; back < 7; back += 1) {
      const day = day0 - back;
      const slots = await api("GET", `/api/shop/grooming/availability?date=${qDay(day)}&packageId=${pkg.id}`, null, token);
      const want = qAt(day, time, now).getTime();
      const ok = (Array.isArray(slots) ? slots : []).filter((x) => !ahead || new Date(x.startAt).getTime() > now.getTime() + 60 * 60000);
      if (ok.length) return ok.sort((a, b) => Math.abs(new Date(a.startAt) - want) - Math.abs(new Date(b.startAt) - want))[0];
    }
    return null;
  };
  const book = async (cust, pkg, slot, code) => {
    const c = S.customers[cust];
    if (!c?.token) throw new Error(`customer ${cust} is not registered`);
    const pet = c.def.pets[0];
    return api("POST", "/api/shop/grooming/book", {
      packageId: pkg.id, startAt: slot.startAt, name: c.def.name, phone: c.def.phone, petName: pet.name, breed: pet.breed, ageText: pet.ageText, visitKind: "SHOP", couponCode: code,
    }, c.token);
  };

  // Paid website bookings with a code (the first two are groomed and done).
  for (const [i, bookDay, day, cust, done] of [[0, -16, -14, "hessa", true], [1, -9, -7, "khalid", true], [2, -2, 3, "noora", false]]) {
    const key = `coupon${i}`;
    at(bookDay, "21:05", `grooming coupon booking ${key}`, async () => {
      if (!C.codes) return;
      const pkg = S.pkg.catBasic;
      const slot = await slotNear(S.customers[cust]?.token, day, "11:00", pkg, { ahead: day >= 0 });
      if (!slot) return;
      const r = await book(cust, pkg, slot, C.codes[i]);
      await pay(`booking:${r.bookingId}`);
      C[key] = { id: r.bookingId, startAt: slot.startAt };
    }, { optional: true });
    if (done) {
      at(day, "18:30", `grooming coupon ${key} done`, async () => {
        if (!C[key] || new Date(C[key].startAt).getTime() > Date.now()) return;
        await staffCall("cashier", "PATCH", `/api/appointments/${C[key].id}`, { status: "IN_PROGRESS" });
        await staffCall("cashier", "PATCH", `/api/appointments/${C[key].id}`, { status: "DONE" });
      }, { optional: true });
    }
  }

  // A desk booking with a code (booked by phone, priced at the desk).
  at(-4, "11:40", "grooming desk coupon booking", async () => {
    if (!C.codes) return;
    const c = S.customers.priya;
    const pkg = S.pkg.catBasic;
    const slot = await slotNear(owner, 2, "15:00", pkg, { ahead: true });
    if (!slot) return;
    await staffCall("owner", "POST", "/api/appointments", {
      branchId: L.shop, serviceId: pkg.id, customerId: c?.id, startAt: slot.startAt,
      petName: c?.def.pets[0]?.name, petType: "CAT", notes: "Coupon handed out at the shop", couponCode: C.codes[3],
    });
  }, { optional: true });

  // A website booking waiting for payment: its code is held.
  at(0, "08:20", "grooming coupon booking held", async () => {
    if (!C.codes) return;
    const pkg = S.pkg.catFull;
    const slot = await slotNear(S.customers.sarah?.token, 4, "12:00", pkg, { ahead: true });
    if (!slot) return;
    await book("sarah", pkg, slot, C.codes[4]);
  }, { optional: true });
}
