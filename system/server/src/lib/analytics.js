/**
 * Business analytics (fix-rc): grooming, product sales, new registered users and peak order hours,
 * per Qatar day over a date range. Every figure is aggregated in the database (GROUP BY on the
 * Qatar calendar day / hour), one round trip per endpoint, so a range of any length costs the same
 * number of queries (production: ~50 ms per query, Prisma connection_limit=1).
 *
 * Definitions (also in docs/testing/analytics-reports.md):
 *  - Qatar day / hour: the instant + 3 h (Qatar has no daylight saving).
 *  - Grooming (by the booking's start day): bookings = every real booking (an unpaid website hold
 *    that expired, or one still waiting for payment, is not a booking); done = DONE; pending =
 *    BOOKED / CONFIRMED / CHECKED_IN / IN_PROGRESS; cancelled = CANCELLED; no-show = NO_SHOW.
 *    doneValue = value of the bookings done that day; paid = grooming money taken that day minus
 *    grooming refunds (the Finance GROOMING channel: revenue − refunds, by payment date).
 *  - Products: till (IN_STORE), van (VAN) and website (WEBSITE) sales that count in Finance (not
 *    cancelled, not waiting for payment), by the sale day, and sales orders (SALES_ORDER) by
 *    delivery day (revenue at delivery, as in Finance). Damaged stock sold off a van is not a product
 *    order and is left out (Finance shows it in the VAN channel).
 *    pendingWeb = website orders placed that day not yet delivered / collected (paid, still open);
 *    pendingSo = sales orders created that day still waiting for (part of) their delivery;
 *    cancelled = till / website orders cancelled after they were placed (invoice cancelled) plus
 *    cancelled sales orders, by the day the order was placed; website checkouts never paid
 *    (expired holds) are counted apart as `abandoned`.
 *  - New users: website accounts by their registration time (Customer.registeredAt).
 *  - Peak hours: orders (till, van, website sales that count; sales orders not draft / cancelled,
 *    at the time they were created) by Qatar hour of day and weekday (0 = Sunday).
 * Amounts are whole dirhams in SQL; money() turns them into riyals at the end.
 */
import { prisma } from "./prisma.js";
import { Prisma } from "./prisma-client-bundle.js";
import { money } from "./money.js";
import { qatarDayKey, qatarDayStart } from "./qatarTime.js";

const DAY_MS = 86400000;
export const PRODUCT_CHANNELS = ["IN_STORE", "VAN", "WEBSITE", "SALES_ORDER"];
const SALE_CHANNELS = ["IN_STORE", "VAN", "WEBSITE"];
const PENDING_WEB = Prisma.sql`('CONFIRMED','PREPARING','OUT_FOR_DELIVERY','READY_FOR_PICKUP')`;
const PENDING_SO = Prisma.sql`('CONFIRMED','PARTLY_DELIVERED')`;
const PENDING_GROOMING = Prisma.sql`('BOOKED','CONFIRMED','CHECKED_IN','IN_PROGRESS')`;

/** A UTC instant as a timestamp(3) value (columns hold UTC without a zone). */
export const ts = (date) => Prisma.sql`(${date.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;
/** "YYYY-MM-DD" of the Qatar day of a column. */
export const qDay = (col) => Prisma.sql`to_char(${col} + interval '3 hours', 'YYYY-MM-DD')`;
/** A sale that counts in Finance (lib/financeData.js COUNTED_SALE), for alias `s`. */
export const COUNTED_SQL = Prisma.sql`(s."invoiceStatus" <> 'CANCELLED' AND (s."webStatus" IS NULL OR s."webStatus" NOT IN ('CANCELLED','PENDING_PAYMENT')))`;
/** A website booking hold that was never paid (expired, or still waiting): not a booking. */
const NOT_A_BOOKING = Prisma.sql`(a.status = 'PENDING_PAYMENT' OR (a.status = 'CANCELLED' AND a."holdExpiresAt" IS NOT NULL AND a."paidAt" IS NULL))`;

const num = (v) => Number(v || 0);

/** Every Qatar day key in [from, to). */
export function dayKeys(from, to) {
  const keys = [];
  const last = qatarDayKey(new Date(to.getTime() - 1));
  for (let cur = qatarDayStart(qatarDayKey(from)); qatarDayKey(cur) <= last; cur = new Date(cur.getTime() + DAY_MS)) keys.push(qatarDayKey(cur));
  return keys;
}

/** Start key of the period holding a Qatar day: day itself, the week (from Sunday) or the month. */
export function periodKey(day, groupBy) {
  if (groupBy === "month") return `${day.slice(0, 7)}-01`;
  if (groupBy === "week") {
    const at = new Date(`${day}T00:00:00Z`);
    return new Date(at.getTime() - at.getUTCDay() * DAY_MS).toISOString().slice(0, 10);
  }
  return day;
}

/** Grooming per day of the booking, and the money taken per day of payment. */
export async function groomingAnalytics(orgId, { from, to }, { branchId = "" } = {}) {
  const branchA = branchId ? Prisma.sql`AND a."branchId" = ${branchId}` : Prisma.empty;
  const rows = await prisma.$queryRaw`
    SELECT 'B' AS src, ${qDay(Prisma.sql`a."startAt"`)} AS day,
      count(*)::int AS bookings,
      count(*) FILTER (WHERE a.status = 'DONE')::int AS done,
      count(*) FILTER (WHERE a.status IN ${PENDING_GROOMING})::int AS pending,
      count(*) FILTER (WHERE a.status = 'CANCELLED')::int AS cancelled,
      count(*) FILTER (WHERE a.status = 'NO_SHOW')::int AS "noShow",
      coalesce(sum(a.amount) FILTER (WHERE a.status = 'DONE'), 0)::bigint AS "doneValue",
      0::bigint AS paid, 0::bigint AS refunded
    FROM "Appointment" a
    WHERE a."organizationId" = ${orgId} AND a."startAt" >= ${ts(from)} AND a."startAt" < ${ts(to)} AND NOT ${NOT_A_BOOKING} ${branchA}
    GROUP BY 2
    UNION ALL
    SELECT 'P', ${qDay(Prisma.sql`p."createdAt"`)}, 0, 0, 0, 0, 0, 0,
      coalesce(sum(p.amount) FILTER (WHERE p.kind = 'PAYMENT'), 0)::bigint,
      coalesce(sum(p.amount) FILTER (WHERE p.kind = 'REFUND'), 0)::bigint
    FROM "Payment" p JOIN "Appointment" a ON a.id = p."appointmentId"
    WHERE p."organizationId" = ${orgId} AND p."createdAt" >= ${ts(from)} AND p."createdAt" < ${ts(to)}
      AND ((p.kind = 'PAYMENT' AND p.status IN ('CAPTURED','REJECTED')) OR (p.kind = 'REFUND' AND p.status = 'CAPTURED')) ${branchA}
    GROUP BY 2`;
  const blank = () => ({ bookings: 0, done: 0, pending: 0, cancelled: 0, noShow: 0, doneValue: 0, paid: 0, refunded: 0 });
  const byDay = new Map(dayKeys(from, to).map((k) => [k, { day: k, ...blank() }]));
  for (const r of rows) {
    const row = byDay.get(r.day);
    if (!row) continue;
    for (const key of Object.keys(blank())) row[key] += num(r[key]);
  }
  const totals = blank();
  const days = [...byDay.values()].map((row) => {
    for (const key of Object.keys(totals)) totals[key] += row[key];
    return { ...row, doneValue: money(row.doneValue), paid: money(row.paid - row.refunded), refunded: money(row.refunded) };
  });
  return {
    from, to, days,
    totals: { ...totals, doneValue: money(totals.doneValue), paid: money(totals.paid - totals.refunded), refunded: money(totals.refunded) },
  };
}

/** Product orders per day and channel, pending and cancelled orders, and the top products. */
export async function productAnalytics(orgId, { from, to }, { branchId = "", top = 10 } = {}) {
  const branchS = branchId ? Prisma.sql`AND s."branchId" = ${branchId}` : Prisma.empty;
  const branchD = branchId ? Prisma.sql`AND d."branchId" = ${branchId}` : Prisma.empty;
  const branchO = branchId ? Prisma.sql`AND o."branchId" = ${branchId}` : Prisma.empty;
  const range = (col) => Prisma.sql`${col} >= ${ts(from)} AND ${col} < ${ts(to)}`;
  const [daily, topRows, now] = await Promise.all([
    prisma.$queryRaw`
      SELECT ${qDay(Prisma.sql`s."createdAt"`)} AS day, s."orderChannel"::text AS channel,
        count(*) FILTER (WHERE ${COUNTED_SQL})::int AS orders,
        coalesce(sum(s.total) FILTER (WHERE ${COUNTED_SQL}), 0)::bigint AS amount,
        count(*) FILTER (WHERE s."invoiceStatus" = 'CANCELLED')::int AS cancelled,
        count(*) FILTER (WHERE s."webStatus" = 'CANCELLED' AND s."invoiceStatus" <> 'CANCELLED')::int AS abandoned,
        count(*) FILTER (WHERE s."webStatus" IN ${PENDING_WEB})::int AS "pendingWeb",
        0::int AS "pendingSo"
      FROM "Sale" s JOIN "Branch" b ON b.id = s."branchId"
      WHERE b."organizationId" = ${orgId} AND ${range(Prisma.sql`s."createdAt"`)} ${branchS}
      GROUP BY 1, 2
      UNION ALL
      SELECT ${qDay(Prisma.sql`d."deliveredAt"`)}, 'SALES_ORDER', count(*)::int, coalesce(sum(d.revenue), 0)::bigint, 0, 0, 0, 0
      FROM "SalesOrderDelivery" d JOIN "SalesOrder" o ON o.id = d."orderId"
      WHERE o."organizationId" = ${orgId} AND ${range(Prisma.sql`d."deliveredAt"`)} ${branchD}
      GROUP BY 1
      UNION ALL
      SELECT ${qDay(Prisma.sql`o."createdAt"`)}, 'SALES_ORDER', 0, 0,
        count(*) FILTER (WHERE o.status = 'CANCELLED')::int, 0, 0,
        count(*) FILTER (WHERE o.status IN ${PENDING_SO})::int
      FROM "SalesOrder" o
      WHERE o."organizationId" = ${orgId} AND ${range(Prisma.sql`o."createdAt"`)} ${branchO}
      GROUP BY 1`,
    prisma.$queryRaw`
      SELECT x."productId", p.name, p."nameEn", p."sellBy"::text AS "sellBy",
        sum(x.qty)::bigint AS quantity, sum(x.amount)::bigint AS amount, sum(x.lines)::int AS lines
      FROM (
        SELECT i."productId", sum(i.quantity) AS qty, sum(CASE WHEN i."isFree" THEN 0 ELSE i.subtotal END) AS amount, count(*) AS lines
        FROM "SaleItem" i JOIN "Sale" s ON s.id = i."saleId" JOIN "Branch" b ON b.id = s."branchId"
        WHERE b."organizationId" = ${orgId} AND ${range(Prisma.sql`s."createdAt"`)} AND ${COUNTED_SQL} ${branchS}
        GROUP BY 1
        UNION ALL
        SELECT l."productId", sum(dl.quantity), sum(dl.revenue), count(*)
        FROM "SalesOrderDeliveryLine" dl JOIN "SalesOrderDelivery" d ON d.id = dl."deliveryId"
          JOIN "SalesOrder" o ON o.id = d."orderId" JOIN "SalesOrderLine" l ON l.id = dl."lineId"
        WHERE o."organizationId" = ${orgId} AND ${range(Prisma.sql`d."deliveredAt"`)} ${branchD}
        GROUP BY 1
      ) x JOIN "Product" p ON p.id = x."productId"
      GROUP BY 1, 2, 3, 4
      ORDER BY amount DESC, quantity DESC, p.name
      LIMIT ${Math.max(1, Math.min(50, Number(top) || 10))}`,
    // Open right now, whatever day they were placed (the list staff still have to work through).
    prisma.$queryRaw`
      SELECT
        (SELECT count(*) FROM "Sale" s JOIN "Branch" b ON b.id = s."branchId"
          WHERE b."organizationId" = ${orgId} AND s."webStatus" IN ${PENDING_WEB} ${branchS})::int AS "pendingWeb",
        (SELECT count(*) FROM "SalesOrder" o WHERE o."organizationId" = ${orgId} AND o.status IN ${PENDING_SO} ${branchO})::int AS "pendingSo"`,
  ]);

  const blankCh = () => ({ orders: 0, amount: 0 });
  const blank = () => ({ orders: 0, amount: 0, cancelled: 0, abandoned: 0, pendingWeb: 0, pendingSo: 0, channels: Object.fromEntries(PRODUCT_CHANNELS.map((c) => [c, blankCh()])) });
  const byDay = new Map(dayKeys(from, to).map((k) => [k, { day: k, ...blank() }]));
  for (const r of daily) {
    const row = byDay.get(r.day);
    if (!row) continue;
    const ch = PRODUCT_CHANNELS.includes(r.channel) ? r.channel : "IN_STORE";
    row.orders += num(r.orders);
    row.amount += num(r.amount);
    row.channels[ch].orders += num(r.orders);
    row.channels[ch].amount += num(r.amount);
    row.cancelled += num(r.cancelled);
    row.abandoned += num(r.abandoned);
    row.pendingWeb += num(r.pendingWeb);
    row.pendingSo += num(r.pendingSo);
  }
  const totals = blank();
  const out = (row) => ({
    ...row,
    amount: money(row.amount),
    channels: Object.fromEntries(Object.entries(row.channels).map(([k, v]) => [k, { orders: v.orders, amount: money(v.amount) }])),
  });
  const days = [...byDay.values()].map((row) => {
    for (const key of ["orders", "amount", "cancelled", "abandoned", "pendingWeb", "pendingSo"]) totals[key] += row[key];
    for (const ch of PRODUCT_CHANNELS) {
      totals.channels[ch].orders += row.channels[ch].orders;
      totals.channels[ch].amount += row.channels[ch].amount;
    }
    return out(row);
  });
  return {
    from, to, days,
    totals: out(totals),
    pendingNow: { web: num(now[0]?.pendingWeb), salesOrders: num(now[0]?.pendingSo) },
    topProducts: topRows.map((r, i) => {
      const weight = r.sellBy === "WEIGHT";
      return {
        rank: i + 1,
        productId: r.productId,
        name: r.name,
        nameEn: r.nameEn || r.name,
        unit: weight ? "kg" : "pc",
        // Weight goods: grams in the database, kilograms here.
        quantity: weight ? Math.round(num(r.quantity)) / 1000 : num(r.quantity),
        amount: money(num(r.amount)),
        lines: num(r.lines),
      };
    }),
  };
}

/** Website accounts registered per day / week (from Sunday) / month in the range. */
export async function newUsersAnalytics(orgId, { from, to }, { groupBy = "day" } = {}) {
  const rows = await prisma.$queryRaw`
    SELECT ${qDay(Prisma.sql`c."registeredAt"`)} AS day, count(*)::int AS registered,
      count(*) FILTER (WHERE c."emailVerifiedAt" IS NOT NULL)::int AS verified
    FROM "Customer" c
    WHERE c."organizationId" = ${orgId} AND c."registeredAt" >= ${ts(from)} AND c."registeredAt" < ${ts(to)}
    GROUP BY 1`;
  const periods = new Map();
  for (const day of dayKeys(from, to)) {
    const key = periodKey(day, groupBy);
    if (!periods.has(key)) periods.set(key, { period: key, registered: 0, verified: 0 });
  }
  let registered = 0;
  let verified = 0;
  for (const r of rows) {
    const row = periods.get(periodKey(r.day, groupBy));
    if (!row) continue;
    row.registered += num(r.registered);
    row.verified += num(r.verified);
    registered += num(r.registered);
    verified += num(r.verified);
  }
  return { from, to, groupBy, periods: [...periods.values()], totals: { registered, verified } };
}

/** Orders by Qatar hour of day and weekday, for one channel or all product channels. */
export async function peakHoursAnalytics(orgId, { from, to }, { channel = "", branchId = "" } = {}) {
  const ch = PRODUCT_CHANNELS.includes(channel) ? channel : "";
  const withSales = !ch || SALE_CHANNELS.includes(ch);
  const withSo = !ch || ch === "SALES_ORDER";
  const parts = [];
  if (withSales) {
    parts.push(Prisma.sql`
      SELECT s."createdAt" + interval '3 hours' AS t, s.total AS amount
      FROM "Sale" s JOIN "Branch" b ON b.id = s."branchId"
      WHERE b."organizationId" = ${orgId} AND s."createdAt" >= ${ts(from)} AND s."createdAt" < ${ts(to)} AND ${COUNTED_SQL}
        ${ch ? Prisma.sql`AND s."orderChannel"::text = ${ch}` : Prisma.empty} ${branchId ? Prisma.sql`AND s."branchId" = ${branchId}` : Prisma.empty}`);
  }
  if (withSo) {
    parts.push(Prisma.sql`
      SELECT o."createdAt" + interval '3 hours' AS t, o.total AS amount
      FROM "SalesOrder" o
      WHERE o."organizationId" = ${orgId} AND o."createdAt" >= ${ts(from)} AND o."createdAt" < ${ts(to)} AND o.status NOT IN ('DRAFT','CANCELLED')
        ${branchId ? Prisma.sql`AND o."branchId" = ${branchId}` : Prisma.empty}`);
  }
  const rows = await prisma.$queryRaw`
    SELECT extract(dow FROM x.t)::int AS dow, extract(hour FROM x.t)::int AS hour, count(*)::int AS orders, coalesce(sum(x.amount), 0)::bigint AS amount
    FROM (${Prisma.join(parts, " UNION ALL ")}) x
    GROUP BY 1, 2`;
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, orders: 0, amount: 0 }));
  const weekdays = Array.from({ length: 7 }, (_, weekday) => ({ weekday, orders: 0, amount: 0 }));
  const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
  let orders = 0;
  for (const r of rows) {
    const h = hours[num(r.hour)];
    const w = weekdays[num(r.dow)];
    h.orders += num(r.orders);
    h.amount += num(r.amount);
    w.orders += num(r.orders);
    w.amount += num(r.amount);
    grid[num(r.dow)][num(r.hour)] += num(r.orders);
    orders += num(r.orders);
  }
  const peak = hours.reduce((best, h) => (h.orders > (best?.orders || 0) ? h : best), null);
  const peakDay = weekdays.reduce((best, w) => (w.orders > (best?.orders || 0) ? w : best), null);
  return {
    from, to, channel: ch,
    hours: hours.map((h) => ({ ...h, amount: money(h.amount) })),
    weekdays: weekdays.map((w) => ({ ...w, amount: money(w.amount) })),
    grid,
    totals: { orders, peakHour: peak ? peak.hour : null, peakWeekday: peakDay ? peakDay.weekday : null },
  };
}

/**
 * The Dashboard's compact summary in ONE query: today's grooming (done / pending / cancelled /
 * no-show), today's product orders (placed / pending / cancelled), website registrations this week
 * (from Sunday) and today, and the busiest order hour over the last 30 days.
 */
export async function todaySummary(orgId, now = new Date()) {
  const todayKey = qatarDayKey(now);
  const start = qatarDayStart(todayKey);
  const end = new Date(start.getTime() + DAY_MS);
  const weekStart = qatarDayStart(periodKey(todayKey, "week"));
  const peakFrom = new Date(start.getTime() - 29 * DAY_MS);
  const [r] = await prisma.$queryRaw`
    SELECT
      (SELECT json_build_object(
          'bookings', count(*),
          'done', count(*) FILTER (WHERE a.status = 'DONE'),
          'pending', count(*) FILTER (WHERE a.status IN ${PENDING_GROOMING}),
          'cancelled', count(*) FILTER (WHERE a.status = 'CANCELLED'),
          'noShow', count(*) FILTER (WHERE a.status = 'NO_SHOW'))
        FROM "Appointment" a
        WHERE a."organizationId" = ${orgId} AND a."startAt" >= ${ts(start)} AND a."startAt" < ${ts(end)} AND NOT ${NOT_A_BOOKING}) AS grooming,
      (SELECT json_build_object(
          'orders', count(*) FILTER (WHERE ${COUNTED_SQL}),
          'pending', count(*) FILTER (WHERE s."webStatus" IN ${PENDING_WEB}),
          'cancelled', count(*) FILTER (WHERE s."invoiceStatus" = 'CANCELLED'))
        FROM "Sale" s JOIN "Branch" b ON b.id = s."branchId"
        WHERE b."organizationId" = ${orgId} AND s."createdAt" >= ${ts(start)} AND s."createdAt" < ${ts(end)}) AS sales,
      (SELECT json_build_object(
          'orders', count(*) FILTER (WHERE o.status NOT IN ('DRAFT','CANCELLED')),
          'pending', count(*) FILTER (WHERE o.status IN ${PENDING_SO}),
          'cancelled', count(*) FILTER (WHERE o.status = 'CANCELLED'))
        FROM "SalesOrder" o
        WHERE o."organizationId" = ${orgId} AND o."createdAt" >= ${ts(start)} AND o."createdAt" < ${ts(end)}) AS "salesOrders",
      (SELECT json_build_object(
          'week', count(*),
          'today', count(*) FILTER (WHERE c."registeredAt" >= ${ts(start)}))
        FROM "Customer" c
        WHERE c."organizationId" = ${orgId} AND c."registeredAt" >= ${ts(weekStart)} AND c."registeredAt" < ${ts(end)}) AS users,
      (SELECT json_build_object('hour', h, 'orders', n) FROM (
        SELECT extract(hour FROM x.t)::int AS h, count(*) AS n FROM (
          SELECT s."createdAt" + interval '3 hours' AS t FROM "Sale" s JOIN "Branch" b ON b.id = s."branchId"
            WHERE b."organizationId" = ${orgId} AND s."createdAt" >= ${ts(peakFrom)} AND s."createdAt" < ${ts(end)} AND ${COUNTED_SQL}
          UNION ALL
          SELECT o."createdAt" + interval '3 hours' FROM "SalesOrder" o
            WHERE o."organizationId" = ${orgId} AND o."createdAt" >= ${ts(peakFrom)} AND o."createdAt" < ${ts(end)} AND o.status NOT IN ('DRAFT','CANCELLED')
        ) x GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 1) p) AS peak`;
  const g = r?.grooming || {};
  const s = r?.sales || {};
  const so = r?.salesOrders || {};
  return {
    day: todayKey,
    weekStart: periodKey(todayKey, "week"),
    grooming: { bookings: num(g.bookings), done: num(g.done), pending: num(g.pending), cancelled: num(g.cancelled), noShow: num(g.noShow) },
    orders: {
      placed: num(s.orders) + num(so.orders),
      pending: num(s.pending) + num(so.pending),
      cancelled: num(s.cancelled) + num(so.cancelled),
    },
    newUsers: { week: num(r?.users?.week), today: num(r?.users?.today) },
    peakHour: r?.peak ? { hour: num(r.peak.hour), orders: num(r.peak.orders), days: 30 } : null,
  };
}
