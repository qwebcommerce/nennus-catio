import { prisma } from "./prisma.js";

/**
 * Writes an audit row (FR-88, NFR-16). Pass the transaction client as `db` so the
 * row commits or rolls back together with the change it records. Failures are NOT
 * swallowed: an audited change must not succeed silently without its audit row.
 * Rows are append-only (DB trigger rejects UPDATE/DELETE on "AuditLog").
 */
export async function writeAudit(
  { userId, action, entityType, entityId, branchId, summary, meta },
  db = prisma
) {
  try {
    return await db.auditLog.create({
      data: {
        userId: userId ?? null,
        action: String(action),
        entityType: entityType != null ? String(entityType) : null,
        entityId: entityId != null ? String(entityId) : null,
        branchId: branchId != null ? String(branchId) : null,
        summary: summary != null ? String(summary).slice(0, 2000) : null,
        meta: meta != null ? JSON.stringify(meta).slice(0, 8000) : null,
      },
    });
  } catch (e) {
    console.error("auditLog write failed", action, e?.code || e?.message);
    throw e;
  }
}
