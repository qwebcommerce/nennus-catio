/**
 * fix-re: "Coupon discounts" for Finance (docs/testing/coupons.md). Grooming revenue in Finance is
 * already net of coupons (it is the money actually paid: Payment rows); this is the discount given
 * on top, by batch: committed coupon uses whose commit time is in the range (a website use commits
 * with its payment, a desk use with the booking). Whole dirhams in, riyals out.
 */
import { prisma } from "./prisma.js";
import { Prisma } from "./prisma-client-bundle.js";
import { money } from "./money.js";
import { ts } from "./analytics.js";

export async function couponDiscountSummary(orgId, { from, to }, { channel = "", branchId = "" } = {}) {
  if (channel && channel !== "GROOMING") return { total: 0, uses: 0, byBatch: [] };
  const branch = branchId ? Prisma.sql`AND a."branchId" = ${branchId}` : Prisma.empty;
  const rows = await prisma.$queryRaw`
    SELECT b.id, b.name, b."nameEn", count(*)::int AS uses, coalesce(sum(r.discount), 0)::bigint AS discount,
      coalesce(sum(a.amount), 0)::bigint AS "bookingValue"
    FROM "CouponRedemption" r
    JOIN "CouponBatch" b ON b.id = r."batchId"
    JOIN "Appointment" a ON a.id = r."appointmentId"
    WHERE r."organizationId" = ${orgId} AND r.status = 'COMMITTED'
      AND r."committedAt" >= ${ts(from)} AND r."committedAt" < ${ts(to)} ${branch}
    GROUP BY b.id, b.name, b."nameEn"
    ORDER BY 5 DESC`;
  const byBatch = rows.map((r) => ({ batchId: r.id, name: r.name, nameEn: r.nameEn, uses: Number(r.uses), discount: money(Number(r.discount)), bookingValue: money(Number(r.bookingValue)) }));
  const total = rows.reduce((t, r) => t + Number(r.discount), 0);
  return { total: money(total), uses: byBatch.reduce((t, r) => t + r.uses, 0), byBatch };
}
