import { db } from "./db.js";

/**
 * يحفظ نتيجة /api/products للفرع (للعرض دون اتصال).
 * @param {string} branchId
 * @param {unknown[]} list
 */
export async function saveProductsForBranch(branchId, list) {
  if (!branchId || !Array.isArray(list)) return;
  const t = Date.now();
  await db.transaction("rw", db.products, async () => {
    await db.products.where("branchId").equals(branchId).delete();
    for (const p of list) {
      await db.products.put({
        branchId,
        productId: p.id,
        payload: p,
        updatedAt: t,
      });
    }
  });
}

export async function loadProductsForBranch(branchId) {
  if (!branchId) return [];
  const rows = await db.products.where("branchId").equals(branchId).toArray();
  return rows.map((r) => r.payload).filter(Boolean);
}

/**
 * @param {string} branchId
 * @param {unknown[]} list
 */
export async function saveCustomers(list) {
  if (!Array.isArray(list)) return;
  const t = Date.now();
  await db.transaction("rw", db.customers, async () => {
    for (const c of list) {
      await db.customers.put({
        id: c.id,
        payload: c,
        updatedAt: t,
      });
    }
  });
}

export async function loadCustomers() {
  const rows = await db.customers.toArray();
  return rows.map((r) => r.payload).filter(Boolean);
}

/**
 * @param {string} branchId
 * @param {string} productId
 * @param {number} delta negative يخصم
 */
export async function adjustLocalInventory(branchId, productId, delta) {
  const key = [branchId, productId];
  const row = await db.inventory.get(key);
  const q = Math.max(0, (row?.quantity ?? 0) + delta);
  await db.inventory.put({
    branchId,
    productId,
    quantity: q,
    updatedAt: Date.now(),
  });
}

/** يبني صفوف المخزون من قائمة منتجات الـ API */
export async function hydrateInventoryFromProducts(branchId, products) {
  if (!branchId || !Array.isArray(products)) return;
  const t = Date.now();
  await db.transaction("rw", db.inventory, async () => {
    for (const p of products) {
      const inv = p.inventories?.[0];
      const qty = inv?.quantity ?? 0;
      await db.inventory.put({
        branchId,
        productId: p.id,
        quantity: qty,
        updatedAt: t,
      });
    }
  });
}

/** يطبّق خصم السطر على المخزون المحلي بعد بيع دون اتصال ويحدّث نسخة المنتج المخزّنة */
export async function applyOfflineSaleToInventory(branchId, items) {
  for (const line of items) {
    await adjustLocalInventory(branchId, line.productId, -Math.abs(line.quantity));
    const row = await db.products.get([branchId, line.productId]);
    if (row?.payload && row.branchId === branchId) {
      const p = { ...row.payload };
      const inv = Array.isArray(p.inventories) ? [...p.inventories] : [{}];
      const q = Math.max(0, (inv[0]?.quantity ?? 0) - Math.abs(line.quantity));
      inv[0] = { ...inv[0], quantity: q };
      p.inventories = inv;
      await db.products.put({
        ...row,
        payload: p,
        updatedAt: Date.now(),
      });
    }
  }
}

/** يزيد المخزون المحلي بعد إرجاع دون اتصال */
export async function applyOfflineRefundToInventory(branchId, items) {
  for (const line of items) {
    const qty = Math.abs(line.quantity);
    await adjustLocalInventory(branchId, line.productId, qty);
    const row = await db.products.get([branchId, line.productId]);
    if (row?.payload && row.branchId === branchId) {
      const p = { ...row.payload };
      const inv = Array.isArray(p.inventories) ? [...p.inventories] : [{}];
      const q = Math.max(0, (inv[0]?.quantity ?? 0) + qty);
      inv[0] = { ...inv[0], quantity: q };
      p.inventories = inv;
      await db.products.put({
        ...row,
        payload: p,
        updatedAt: Date.now(),
      });
    }
  }
}
