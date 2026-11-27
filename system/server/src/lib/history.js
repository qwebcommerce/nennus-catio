/**
 * Transactions history (fix-rc): the rows of Finance's sales-and-refunds list
 * (lib/financeData.js financeTransactions) built in ONE SQL query, filtered, searched and paged on
 * the server, with the totals of the whole filtered set. Same sources and rules as Finance:
 *  - SALE: till / van / website sales that count (not cancelled, not waiting for payment), by sale time;
 *  - REFUND: refunds of counted sales (or with no sale), on the refund's date and its sale's channel
 *    (no sale: the location's channel);
 *  - PAYMENT / REFUND on GROOMING and RELOCATION: captured payments (and rejected ones that came in
 *    and went back) and captured refunds, by payment time;
 *  - SALE on SALES_ORDER: each delivery of a sales order at its revenue, by delivery time;
 *  - REFUND kind VAN_RETURN: van returns received at the warehouse, by receive time;
 *  - SALE kind DAMAGED_SALE: damaged stock sold, by the sale time.
 * So for the same dates / channel / location / type, the totals here equal Finance's.
 *
 * Paging is by keyset (date, id) newest first: a page never repeats or skips a row while new rows
 * arrive. Search (`q`): a phone number (digits, compared without spaces / + / dashes), or a till
 * receipt / invoice number, website order reference (NC-ORD-…), sales-order reference (NC-SO-…),
 * grooming / relocation reference, van-return reference, payment reference, or the customer's name.
 *
 * Expense history: Expense rows, paged by (expenseDate, createdAt, id), searchable by payee,
 * receipt number and note; totals per "paid from" equal Finance's expenses by source.
 */
import { prisma } from "./prisma.js";
import { Prisma } from "./prisma-client-bundle.js";
import { money } from "./money.js";
import { COUNTED_SQL, ts } from "./analytics.js";
import { CHANNELS } from "./financeData.js";

export const HISTORY_METHODS = ["CASH", "CARD", "ONLINE", "FAWRAN", "PAYMENT_LINK", "BANK_TRANSFER", "BANK", "SPLIT", "ON_DELIVERY", "ON_ACCOUNT"];
const MAX_LIMIT = 200;

/** Cursor = base64url of "ISO date|id". */
export function encodeCursor(date, id) {
  return Buffer.from(`${new Date(date).toISOString()}|${id}`).toString("base64url");
}
export function decodeCursor(raw) {
  if (!raw) return null;
  try {
    const [iso, id] = Buffer.from(String(raw), "base64url").toString("utf8").split("|");
    const date = new Date(iso);
    if (!id || Number.isNaN(date.getTime())) return null;
    return { date, id };
  } catch {
    return null;
  }
}

/** Parses ?channel=&branchId=&type=&method=&q=&cursor=&limit= for the history. */
export function historyFilters(query) {
  const channel = CHANNELS.includes(String(query?.channel || "").toUpperCase()) ? String(query.channel).toUpperCase() : "";
  const rawType = String(query?.type || "").toLowerCase();
  const method = HISTORY_METHODS.includes(String(query?.method || "").toUpperCase()) ? String(query.method).toUpperCase() : "";
  return {
    channel,
    branchId: query?.branchId ? String(query.branchId) : "",
    type: rawType === "sale" || rawType === "refund" ? rawType : "",
    method,
    q: String(query?.q || "").trim().slice(0, 80),
    cursor: decodeCursor(query?.cursor),
    badCursor: Boolean(query?.cursor) && !decodeCursor(query?.cursor),
    limit: Math.min(Math.max(Number(query?.limit) || 50, 1), MAX_LIMIT),
  };
}

/** Search condition on the unified rows: phone digits, references, customer name. */
function searchSql(q) {
  if (!q) return Prisma.empty;
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const digits = q.replace(/\D/g, "");
  const phoneLike = /^[+\d\s()-]+$/.test(q) && digits.length >= 4 ? Prisma.sql`OR regexp_replace(coalesce(t.phone, ''), '\\D', '', 'g') LIKE ${`%${digits}%`}` : Prisma.empty;
  return Prisma.sql`AND (t.refs ILIKE ${like} OR t.reference ILIKE ${like} OR t.customer ILIKE ${like} ${phoneLike})`;
}

function unifiedSql(orgId, { from, to }) {
  const range = (col) => Prisma.sql`${col} >= ${ts(from)} AND ${col} < ${ts(to)}`;
  return Prisma.sql`
    SELECT 'SALE' AS type, NULL::text AS kind, s.id, coalesce(s."invoiceNumber", s.reference, upper(right(s.id, 8))) AS reference,
      concat_ws(' ', s."invoiceNumber", s.reference, s."paymentReference") AS refs, s."createdAt" AS date,
      s."orderChannel"::text AS channel, s."branchId" AS "branchId", b.name AS location, coalesce(b."nameEn", b.name) AS "locationEn",
      coalesce(c.name, '') AS customer, c.phone AS phone, s."paymentMethod"::text AS method,
      coalesce(s."webStatus"::text, s."invoiceStatus"::text) AS status, s.total::bigint AS amount, s.id AS "saleId", NULL::text AS "parentId"
    FROM "Sale" s JOIN "Branch" b ON b.id = s."branchId" LEFT JOIN "Customer" c ON c.id = s."customerId"
    WHERE b."organizationId" = ${orgId} AND ${range(Prisma.sql`s."createdAt"`)} AND ${COUNTED_SQL}
    UNION ALL
    SELECT 'REFUND', NULL, r.id, coalesce(s."invoiceNumber", s.reference, upper(right(coalesce(r."saleId", r.id), 8))),
      concat_ws(' ', s."invoiceNumber", s.reference, s."paymentReference"), r."createdAt",
      coalesce(s."orderChannel"::text, CASE WHEN b.kind = 'VAN' THEN 'VAN' ELSE 'IN_STORE' END), r."branchId", b.name, coalesce(b."nameEn", b.name),
      coalesce(c.name, ''), c.phone, coalesce(r.method::text, s."paymentMethod"::text, ''), 'REFUNDED', -r.total::bigint, r."saleId", NULL
    FROM "Refund" r JOIN "Branch" b ON b.id = r."branchId" LEFT JOIN "Sale" s ON s.id = r."saleId" LEFT JOIN "Customer" c ON c.id = s."customerId"
    WHERE b."organizationId" = ${orgId} AND ${range(Prisma.sql`r."createdAt"`)} AND (s.id IS NULL OR ${COUNTED_SQL})
    UNION ALL
    SELECT CASE WHEN p.kind = 'REFUND' THEN 'REFUND' ELSE 'PAYMENT' END, NULL, p.id,
      coalesce(a.reference, rr.reference, upper(right(coalesce(p."appointmentId", p."relocationRequestId"), 8))),
      concat_ws(' ', a.reference, rr.reference, p.reference), p."createdAt",
      CASE WHEN p."appointmentId" IS NOT NULL THEN 'GROOMING' ELSE 'RELOCATION' END, coalesce(a."branchId", ''), coalesce(ab.name, ''), coalesce(ab."nameEn", ab.name, ''),
      coalesce(ac.name, rc.name, ''), coalesce(ac.phone, rc.phone), p.method,
      CASE WHEN p.kind = 'REFUND' THEN 'REFUNDED' WHEN p.status = 'REJECTED' THEN 'REJECTED' ELSE 'PAID' END,
      CASE WHEN p.kind = 'REFUND' THEN -p.amount ELSE p.amount END::bigint, NULL, coalesce(p."appointmentId", p."relocationRequestId")
    FROM "Payment" p
      LEFT JOIN "Appointment" a ON a.id = p."appointmentId" LEFT JOIN "Branch" ab ON ab.id = a."branchId" LEFT JOIN "Customer" ac ON ac.id = a."customerId"
      LEFT JOIN "RelocationRequest" rr ON rr.id = p."relocationRequestId" LEFT JOIN "Customer" rc ON rc.id = rr."customerId"
    WHERE p."organizationId" = ${orgId} AND ${range(Prisma.sql`p."createdAt"`)}
      AND ((p.kind = 'PAYMENT' AND p.status IN ('CAPTURED','REJECTED')) OR (p.kind = 'REFUND' AND p.status = 'CAPTURED'))
      AND (p."appointmentId" IS NOT NULL OR p."relocationRequestId" IS NOT NULL)
    UNION ALL
    SELECT 'SALE', NULL, d.id, o.reference, o.reference, d."deliveredAt", 'SALES_ORDER', d."branchId", b.name, coalesce(b."nameEn", b.name),
      coalesce(cu."companyName", cu.name, ''), cu.phone, '', 'DELIVERED', d.revenue::bigint, NULL, o.id
    FROM "SalesOrderDelivery" d JOIN "SalesOrder" o ON o.id = d."orderId" JOIN "Branch" b ON b.id = d."branchId" LEFT JOIN "Customer" cu ON cu.id = o."customerId"
    WHERE o."organizationId" = ${orgId} AND ${range(Prisma.sql`d."deliveredAt"`)}
    UNION ALL
    SELECT 'REFUND', 'VAN_RETURN', v.id, coalesce(v.reference, upper(right(v.id, 8))), concat_ws(' ', v.reference, v."paidReference"), v."receivedAt",
      'VAN', v."vanBranchId", b.name, coalesce(b."nameEn", b.name), coalesce(v."customerName", vc.name, ''), coalesce(v."customerPhone", vc.phone),
      CASE WHEN v."paymentStatus" = 'PAID' THEN coalesce(v."paidMethod"::text, '') ELSE '' END,
      CASE WHEN v."paymentStatus" = 'PAID' THEN 'REFUNDED' ELSE 'UNPAID' END, -v."amountOwed"::bigint, NULL, v.id
    FROM "VanReturn" v JOIN "Branch" b ON b.id = v."vanBranchId" LEFT JOIN "Customer" vc ON vc.id = v."customerId"
    WHERE v."organizationId" = ${orgId} AND v.status = 'RECEIVED' AND ${range(Prisma.sql`v."receivedAt"`)}
    UNION ALL
    SELECT 'SALE', 'DAMAGED_SALE', ds.id, coalesce(v.reference, upper(right(ds.id, 8))), coalesce(v.reference, ''), ds."resolvedAt",
      'VAN', coalesce(v."vanBranchId", ''), coalesce(vb.name, ''), coalesce(vb."nameEn", vb.name, ''), '', NULL, coalesce(ds."saleMethod"::text, ''),
      'PAID', coalesce(ds."saleAmount", 0)::bigint, NULL, v.id
    FROM "DamagedStock" ds LEFT JOIN "VanReturn" v ON v.id = ds."vanReturnId" LEFT JOIN "Branch" vb ON vb.id = v."vanBranchId"
    WHERE ds."organizationId" = ${orgId} AND ds.status = 'SOLD' AND ${range(Prisma.sql`ds."resolvedAt"`)}`;
}

function filterSql(f) {
  return Prisma.sql`
    ${f.channel ? Prisma.sql`AND t.channel = ${f.channel}` : Prisma.empty}
    ${f.branchId ? Prisma.sql`AND t."branchId" = ${f.branchId}` : Prisma.empty}
    ${f.type === "sale" ? Prisma.sql`AND t.type <> 'REFUND'` : f.type === "refund" ? Prisma.sql`AND t.type = 'REFUND'` : Prisma.empty}
    ${f.method ? Prisma.sql`AND t.method = ${f.method}` : Prisma.empty}
    ${searchSql(f.q)}`;
}

/** Parses timestamp text from json_agg (UTC, no zone) into a Date. */
const utc = (value) => (value instanceof Date ? value : new Date(`${String(value).replace(" ", "T")}${/Z|[+-]\d\d:?\d\d$/.test(String(value)) ? "" : "Z"}`));

function shapeRow(r) {
  return {
    type: r.type,
    ...(r.kind ? { kind: r.kind } : {}),
    id: r.id,
    reference: r.reference,
    date: utc(r.date),
    channel: r.channel,
    branchId: r.branchId || "",
    location: r.location || "",
    locationEn: r.locationEn || r.location || "",
    customer: r.customer || "",
    phone: r.phone || "",
    paymentMethod: r.method || "",
    status: r.status,
    amount: money(Number(r.amount)),
    ...(r.saleId ? { saleId: r.saleId } : {}),
    ...(r.parentId ? { parentId: r.parentId } : {}),
  };
}

/**
 * One page of the history plus the totals of the whole filtered set, in ONE query.
 * `all: true` returns every row up to `cap` (exports) instead of a page.
 */
export async function transactionHistory(orgId, dates, f, { all = false, cap = 10000 } = {}) {
  const limit = all ? cap : f.limit;
  const after = !all && f.cursor ? Prisma.sql`AND (t.date, t.id) < (${ts(f.cursor.date)}, ${f.cursor.id})` : Prisma.empty;
  const [r] = await prisma.$queryRaw`
    WITH t AS (${unifiedSql(orgId, dates)}),
    f AS (SELECT * FROM t WHERE true ${filterSql(f)})
    SELECT
      (SELECT json_build_object(
        'sales', coalesce(sum(amount) FILTER (WHERE type <> 'REFUND'), 0),
        'refunds', coalesce(-sum(amount) FILTER (WHERE type = 'REFUND'), 0),
        'saleCount', count(*) FILTER (WHERE type <> 'REFUND'),
        'refundCount', count(*) FILTER (WHERE type = 'REFUND')) FROM f) AS totals,
      (SELECT coalesce(json_agg(p ORDER BY p.date DESC, p.id DESC), '[]'::json) FROM (
        SELECT * FROM f t WHERE true ${after} ORDER BY t.date DESC, t.id DESC LIMIT ${limit + 1}
      ) p) AS rows`;
  const raw = r?.rows || [];
  const more = raw.length > limit;
  const page = raw.slice(0, limit);
  const last = page[page.length - 1];
  const sales = Number(r?.totals?.sales || 0);
  const refunds = Number(r?.totals?.refunds || 0);
  return {
    from: dates.from,
    to: dates.to,
    totals: {
      sales: money(sales),
      refunds: money(refunds),
      net: money(sales - refunds),
      saleCount: Number(r?.totals?.saleCount || 0),
      refundCount: Number(r?.totals?.refundCount || 0),
    },
    rows: page.map(shapeRow),
    nextCursor: more && last ? encodeCursor(utc(last.date), last.id) : null,
  };
}

export const EXPENSE_SOURCES = ["CASH", "BANK"];

/** One page of expenses (newest expense date first) with the totals of the filtered set, ONE query. */
export async function expenseHistory(orgId, dates, query, { all = false, cap = 10000 } = {}) {
  const source = EXPENSE_SOURCES.includes(String(query?.paidFrom || query?.method || "").toUpperCase()) ? String(query.paidFrom || query.method).toUpperCase() : "";
  const category = ["RENT", "PAYROLL", "ELECTRICITY", "INTERNET", "OTHER"].includes(String(query?.category || "").toUpperCase()) ? String(query.category).toUpperCase() : "";
  const q = String(query?.q || "").trim().slice(0, 80);
  const limit = all ? cap : Math.min(Math.max(Number(query?.limit) || 50, 1), MAX_LIMIT);
  const cursor = decodeCursor(query?.cursor);
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const where = Prisma.sql`
    e."organizationId" = ${orgId} AND e."expenseDate" >= ${ts(dates.from)} AND e."expenseDate" < ${ts(dates.to)}
    ${source ? Prisma.sql`AND e."paidFrom"::text = ${source}` : Prisma.empty}
    ${category ? Prisma.sql`AND e.category::text = ${category}` : Prisma.empty}
    ${q ? Prisma.sql`AND (e.payee ILIKE ${like} OR e.reference ILIKE ${like} OR e.description ILIKE ${like})` : Prisma.empty}`;
  const after = !all && cursor ? Prisma.sql`AND (e."expenseDate", e.id) < (${ts(cursor.date)}, ${cursor.id})` : Prisma.empty;
  const [r] = await prisma.$queryRaw`
    SELECT
      (SELECT json_build_object(
        'total', coalesce(sum(e.amount), 0), 'count', count(*),
        'cash', coalesce(sum(e.amount) FILTER (WHERE e."paidFrom" = 'CASH'), 0),
        'bank', coalesce(sum(e.amount) FILTER (WHERE e."paidFrom" = 'BANK'), 0))
        FROM "Expense" e WHERE ${where}) AS totals,
      (SELECT coalesce(json_agg(p ORDER BY p."expenseDate" DESC, p.id DESC), '[]'::json) FROM (
        SELECT e.id, e.version, e.category::text AS category, e.amount, e.description, e.payee, e.reference, e."expenseDate",
          e."paidFrom"::text AS "paidFrom", e."createdAt", u.name AS "createdByName"
        FROM "Expense" e LEFT JOIN "User" u ON u.id = e."createdByUserId"
        WHERE ${where} ${after}
        ORDER BY e."expenseDate" DESC, e.id DESC LIMIT ${limit + 1}
      ) p) AS rows`;
  const raw = r?.rows || [];
  const more = raw.length > limit;
  const page = raw.slice(0, limit);
  const last = page[page.length - 1];
  const t = r?.totals || {};
  return {
    from: dates.from,
    to: dates.to,
    totals: { total: money(Number(t.total || 0)), count: Number(t.count || 0), CASH: money(Number(t.cash || 0)), BANK: money(Number(t.bank || 0)) },
    rows: page.map((e) => ({
      id: e.id,
      version: e.version,
      category: e.category,
      amount: money(Number(e.amount)),
      description: e.description,
      payee: e.payee,
      reference: e.reference,
      expenseDate: utc(e.expenseDate),
      paidFrom: e.paidFrom,
      createdAt: utc(e.createdAt),
      createdBy: e.createdByName ? { name: e.createdByName } : null,
    })),
    nextCursor: more && last ? encodeCursor(utc(last.expenseDate), last.id) : null,
  };
}
