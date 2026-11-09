import { Prisma } from "../lib/prisma-client-bundle.js";
import { prisma } from "../lib/prisma.js";
import { resolveStoredImageUrl } from "../lib/productImageUrl.js";
import { getSyncConfig } from "./syncService.js";

const DEFAULT_EZOO_URL = "https://api.ezoo-app.com/api/get-products";
const UPDATE_BATCH_SIZE = 20;

function ezooImageUrl(item) {
  const first = Array.isArray(item.images) ? item.images[0] : null;
  if (first && typeof first === "object" && first.image != null) {
    const u = String(first.image).trim();
    if (u) return resolveStoredImageUrl(u);
  }
  return null;
}

/**
 * جلب المنتجات من API مزود خارجي.
 * يتطلب nationality_id — الافتراضي 1 (قطر). اضبط EZOO_NATIONALITY_ID في server/.env إن لزم.
 */
export async function syncProductsFromEzoo(organizationId) {
  const nationalityId = String(process.env.EZOO_NATIONALITY_ID ?? "1").trim() || "1";
  const endpoint = (process.env.EZOO_GET_PRODUCTS_URL || DEFAULT_EZOO_URL).trim();
  const u = new URL(endpoint);
  if (!u.searchParams.has("nationality_id")) {
    u.searchParams.set("nationality_id", nationalityId);
  }

  const res = await fetch(u.toString(), {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Ezoo get-products: HTTP ${res.status} — ${t.slice(0, 280)}`);
  }

  const data = await res.json();
  const err = data?.Error;
  if (err && err.code && Number(err.code) >= 400) {
    throw new Error(
      `Ezoo API: ${err.validation || err.desc || "خطأ"} (code ${err.code})`
    );
  }

  const list = data?.Response;
  if (!Array.isArray(list)) {
    throw new Error("Ezoo API: الحقل Response ليس مصفوفة منتجات");
  }

  const normalized = list
    .map((item) => {
      const extId = item.id != null ? String(item.id) : "";
      if (!extId) return null;
      const priceNum = Number(item.priceAfterDiscount ?? item.price ?? 0);
      const priceDec = new Prisma.Decimal(
        Number.isFinite(priceNum) ? String(priceNum) : "0"
      );
      const imageUrl = ezooImageUrl(item);
      const desc = item.description != null ? String(item.description) : null;
      const barcode =
        item.barcode != null && String(item.barcode).trim()
          ? String(item.barcode).trim().slice(0, 200)
          : null;
      return {
        externalId: extId,
        name: String(item.name || "منتج").slice(0, 500),
        description: desc,
        barcode,
        price: priceDec,
        imageUrl,
      };
    })
    .filter(Boolean);

  const externalIds = normalized.map((x) => x.externalId);
  const existingRows =
    externalIds.length > 0
      ? await prisma.product.findMany({
          where: { organizationId, externalId: { in: externalIds } },
          select: { id: true, externalId: true },
        })
      : [];
  const existingByExternalId = new Map(
    existingRows.map((r) => [r.externalId, r.id])
  );

  const toCreate = [];
  const toUpdate = [];
  for (const row of normalized) {
    const existingId = existingByExternalId.get(row.externalId);
    if (existingId) toUpdate.push({ id: existingId, ...row });
    else toCreate.push(row);
  }

  let createdCount = 0;
  if (toCreate.length > 0) {
    const created = await prisma.product.createMany({
      data: toCreate.map((row) => ({
        organizationId,
        name: row.name,
        nameEn: null,
        description: row.description,
        sku: null,
        barcode: row.barcode,
        price: row.price,
        cost: null,
        petType: "OTHER",
        imageUrl: row.imageUrl,
        externalId: row.externalId,
      })),
      skipDuplicates: true,
    });
    createdCount = Number(created?.count || 0);
  }

  let updatedCount = 0;
  for (let i = 0; i < toUpdate.length; i += UPDATE_BATCH_SIZE) {
    const batch = toUpdate.slice(i, i + UPDATE_BATCH_SIZE);
    await Promise.all(
      batch.map(async (row) => {
        try {
          await prisma.product.update({
            where: { id: row.id },
            data: {
              name: row.name,
              description: row.description,
              barcode: row.barcode,
              price: row.price,
              imageUrl: row.imageUrl,
            },
          });
          updatedCount++;
        } catch (e) {
          if (
            e instanceof Prisma.PrismaClientKnownRequestError &&
            e.code === "P2002"
          ) {
            return;
          }
          throw e;
        }
      })
    );
  }

  await getSyncConfig(organizationId);
  await prisma.syncSettings.update({
    where: { organizationId },
    data: { lastProductSyncAt: new Date() },
  });

  return {
    source: "ezoo-app.com",
    upserted: createdCount + updatedCount,
    created: createdCount,
    updated: updatedCount,
    totalRemote: list.length,
    at: new Date().toISOString(),
  };
}
