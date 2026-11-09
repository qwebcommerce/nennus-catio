import Dexie from "dexie";

/** @typedef {'sale' | 'refund' | 'stock_update'} SyncQueueType */

export const SYNC_TYPES = Object.freeze({
  SALE: "sale",
  REFUND: "refund",
  STOCK_UPDATE: "stock_update",
});

class PosOfflineDB extends Dexie {
  constructor() {
    super("petstore-pos-offline");
    this.version(1).stores({
      meta: "key",
      syncQueue: "++localId, clientMutationId, type, createdAt",
      products: "[branchId+productId], branchId, productId",
      customers: "id",
      inventory: "[branchId+productId], branchId, productId",
    });
  }
}

export const db = new PosOfflineDB();

export async function getOrCreateDeviceId() {
  const row = await db.meta.get("deviceId");
  if (row?.value) return row.value;
  const id = crypto.randomUUID();
  await db.meta.put({ key: "deviceId", value: id });
  return id;
}
