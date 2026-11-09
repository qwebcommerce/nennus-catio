import { db, SYNC_TYPES } from "./db.js";
import { api } from "../api/client.js";

const MAX_RETRY = 8;

/**
 * @param {import('./db.js').SyncQueueType} type
 * @param {string} clientMutationId
 * @param {Record<string, unknown>} payload جسم الطلب للـ API (مثلاً checkout)
 */
export async function enqueue(type, clientMutationId, payload) {
  if (!clientMutationId) throw new Error("clientMutationId مطلوب");
  const existing = await db.syncQueue.where("clientMutationId").equals(clientMutationId).first();
  if (existing) return existing.localId;
  return db.syncQueue.add({
    type,
    clientMutationId,
    payload,
    createdAt: Date.now(),
    retryCount: 0,
    lastError: null,
    status: "pending",
  });
}

export async function getPendingQueueCount() {
  const rows = await db.syncQueue.toArray();
  return rows.filter((r) => r.status !== "failed").length;
}

export async function getFailedQueueCount() {
  const rows = await db.syncQueue.toArray();
  return rows.filter((r) => r.status === "failed").length;
}

/**
 * طابور تعديل مخزون (جرد يدوي / تصحيح) — يُرسل إلى POST /api/inventory/offline-upsert
 * @param {string} clientMutationId
 * @param {{ productId: string, branchId: string, quantity?: number, minStockLevel?: number, deviceId?: string }} fields
 */
export async function enqueueStockPatch(clientMutationId, fields) {
  return enqueue(SYNC_TYPES.STOCK_UPDATE, clientMutationId, {
    ...fields,
    clientMutationId,
  });
}

/**
 * إعادة محاولة عنصر فشل نهائياً
 * @param {number} localId
 */
export async function retrySyncQueueItem(localId) {
  await db.syncQueue.update(localId, {
    status: "pending",
    retryCount: 0,
    lastError: null,
  });
}

/**
 * يعالج الطابور بالتسلسل — يُستدعى عند عودة الاتصال أو يدوياً.
 * @returns {number} عدد العناصر المُعالجة بنجاح
 */
export async function processSyncQueue() {
  const rows = await db.syncQueue.orderBy("createdAt").toArray();
  let ok = 0;
  for (const row of rows) {
    if (row.status === "failed") continue;
    try {
      const body = { ...row.payload, clientMutationId: row.clientMutationId };
      if (row.type === SYNC_TYPES.SALE) {
        await api("/api/sales/checkout", { method: "POST", body });
      } else if (row.type === SYNC_TYPES.REFUND) {
        await api("/api/refunds", { method: "POST", body });
      } else if (row.type === SYNC_TYPES.STOCK_UPDATE) {
        await api("/api/inventory/offline-upsert", { method: "POST", body });
      } else {
        console.warn("[sync] نوع غير معروف:", row.type);
        await db.syncQueue.update(row.localId, {
          status: "failed",
          lastError: `unknown type: ${row.type}`,
        });
        continue;
      }
      await db.syncQueue.delete(row.localId);
      ok += 1;
    } catch (e) {
      const status = e && typeof e === "object" && "status" in e ? e.status : undefined;
      if (status === 401) {
        console.warn("[sync] جلسة منتهية — أوقف المزامنة حتى إعادة الدخول");
        break;
      }
      const msg = e instanceof Error ? e.message : String(e);
      const nextRetry = (row.retryCount ?? 0) + 1;
      if (nextRetry >= MAX_RETRY) {
        await db.syncQueue.update(row.localId, {
          retryCount: nextRetry,
          lastError: msg,
          status: "failed",
          failedAt: Date.now(),
        });
        console.error("[sync] مهمة فشلت بعد المحاولات (محفوظة للمراجعة):", row.clientMutationId, msg);
      } else {
        await db.syncQueue.update(row.localId, {
          retryCount: nextRetry,
          lastError: msg,
          status: "pending",
        });
      }
    }
  }
  return ok;
}
