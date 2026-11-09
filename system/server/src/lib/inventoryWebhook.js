import { prisma } from "./prisma.js";
import { getPlainSyncApiKey } from "../services/syncService.js";

/**
 * إشعار الموقع الخارجي بعد تغيّر المخزون (لا يعطل الطلب الأصلي).
 * يُرسَل POST JSON إلى inventoryWebhookUrl مع Authorization: Bearer <apiKey> إن وُجد في SyncSettings.
 *
 * @param {string} organizationId
 * @param {{ event: string, lines: Array<{ branchId: string, productId: string, quantityDelta?: number }>, meta?: object }} envelope
 */
export function scheduleInventoryWebhook(organizationId, envelope) {
  if (!envelope?.lines?.length) return;
  setImmediate(() => {
    void sendInventoryWebhookNow(organizationId, envelope).catch((e) =>
      console.error("[inventory-webhook]", e?.message || e)
    );
  });
}

async function sendInventoryWebhookNow(organizationId, { event, lines, meta }) {
  const cfg = await prisma.syncSettings.findUnique({
    where: { organizationId },
  });
  const url = cfg?.inventoryWebhookUrl?.trim();
  if (!url) return;

  const token = getPlainSyncApiKey(cfg);
  const merge = new Map();
  for (const l of lines) {
    const k = `${l.branchId}:${l.productId}`;
    const prev = merge.get(k) || {
      branchId: l.branchId,
      productId: l.productId,
      quantityDelta: 0,
    };
    prev.quantityDelta += Number(l.quantityDelta) || 0;
    merge.set(k, prev);
  }
  const merged = [...merge.values()];

  const invs = await prisma.inventory.findMany({
    where: {
      branch: { organizationId },
      OR: merged.map((m) => ({ productId: m.productId, branchId: m.branchId })),
    },
    include: {
      product: { select: { id: true, sku: true, externalId: true, name: true } },
      branch: { select: { id: true, name: true } },
    },
  });

  const invKey = (b, p) => `${b}:${p}`;
  const invMap = new Map(
    invs.map((i) => [invKey(i.branchId, i.productId), i])
  );

  const items = merged.map((m) => {
    const inv = invMap.get(invKey(m.branchId, m.productId));
    const row = {
      productId: m.productId,
      branchId: m.branchId,
      sku: inv?.product?.sku ?? null,
      externalId: inv?.product?.externalId ?? null,
      name: inv?.product?.name ?? null,
      quantity: inv != null ? inv.quantity : null,
      minStockLevel: inv?.minStockLevel ?? null,
      branchName: inv?.branch?.name ?? null,
    };
    if (m.quantityDelta !== 0) {
      row.quantityDelta = m.quantityDelta;
    }
    return row;
  });

  const body = {
    event,
    organizationId,
    occurredAt: new Date().toISOString(),
    meta: meta ?? null,
    items,
  };

  const headers = {
    "Content-Type": "application/json",
    "X-POS-Inventory-Event": event,
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${txt.slice(0, 200)}`);
    }
  } finally {
    clearTimeout(timer);
  }
}
