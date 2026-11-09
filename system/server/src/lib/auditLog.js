import { prisma } from "./prisma.js";

/**
 * يسجّل حدثاً في سجل التدقيق — لا يرمي للخارج حتى لا يكسر العملية الرئيسية
 */
export async function writeAudit({
  userId,
  action,
  entityType,
  entityId,
  branchId,
  summary,
  meta,
}) {
  try {
    await prisma.auditLog.create({
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
    console.error("auditLog write failed", e);
  }
}
