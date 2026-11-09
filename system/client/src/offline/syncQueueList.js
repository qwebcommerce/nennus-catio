import { db } from "./db.js";

export async function listSyncQueueRows() {
  return db.syncQueue.orderBy("createdAt").reverse().toArray();
}

/**
 * حذف عنصر عالق يدوياً (مثلاً بعد إصلاح السيرفر)
 * @param {number} localId
 */
export async function removeSyncQueueItem(localId) {
  return db.syncQueue.delete(localId);
}
