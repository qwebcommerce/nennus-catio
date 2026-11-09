/**
 * خدمة مزامنة الموقع الخارجي
 * — تستبدل طلبات fetch الفعلية بعنوان الموقع + API Key من SyncSettings
 * — جاهزة لتوسيعها لتطابق مسارات API لموقعك الحالي
 */

import { Prisma } from "../lib/prisma-client-bundle.js";
import { prisma } from "../lib/prisma.js";
import { decryptSecret, encryptSecret } from "../lib/secretCrypto.js";

export async function getSyncConfig(organizationId) {
  let row = await prisma.syncSettings.findUnique({
    where: { organizationId },
  });
  if (!row) {
    row = await prisma.syncSettings.create({ data: { organizationId } });
  }
  return row;
}

/** مفتاح API نصي للاستخدام في fetch فقط — لا يُرسل للعميل */
export function getPlainSyncApiKey(row) {
  if (!row?.apiKey) return null;
  try {
    return decryptSecret(row.apiKey);
  } catch {
    return null;
  }
}

export async function saveSyncConfig(organizationId, {
  websiteBaseUrl,
  apiKey,
  inventoryWebhookUrl,
}) {
  const existing = await prisma.syncSettings.findUnique({
    where: { organizationId },
  });
  let storedKey;
  if (apiKey !== undefined) {
    const t = apiKey?.trim();
    storedKey = t ? encryptSecret(t) : null;
  }
  if (existing) {
    return prisma.syncSettings.update({
      where: { organizationId },
      data: {
        ...(websiteBaseUrl !== undefined && {
          websiteBaseUrl: websiteBaseUrl?.trim() || null,
        }),
        ...(apiKey !== undefined && { apiKey: storedKey }),
        ...(inventoryWebhookUrl !== undefined && {
          inventoryWebhookUrl: inventoryWebhookUrl?.trim() || null,
        }),
      },
    });
  }
  return prisma.syncSettings.create({
    data: {
      organizationId,
      websiteBaseUrl: websiteBaseUrl?.trim() || null,
      apiKey: storedKey ?? null,
      inventoryWebhookUrl: inventoryWebhookUrl?.trim() || null,
    },
  });
}

/**
 * سحب المنتجات من الموقع (مثال: GET /api/products)
 * عدّل المسار والتنسيق حسب API الموقع الفعلي
 */
export async function syncProductsFromWebsite(organizationId) {
  const cfg = await getSyncConfig(organizationId);
  const key = getPlainSyncApiKey(cfg);
  if (!cfg.websiteBaseUrl || !key) {
    throw new Error("يجب حفظ عنوان الموقع و API Key أولاً");
  }
  const provider = detectProvider(cfg.websiteBaseUrl, key);
  const list = await fetchProductsByProvider(provider, cfg.websiteBaseUrl, key);
  let upserted = 0;
  let skipped = 0;
  const skippedItems = [];
  for (const item of list) {
    const extId = String(item.id ?? item.externalId ?? "");
    if (!extId) continue;
    const existing = await prisma.product.findFirst({
      where: { organizationId, externalId: extId },
    });
    const priceDec = new Prisma.Decimal(String(item.price ?? "0"));
    const costDec =
      item.cost != null && item.cost !== ""
        ? new Prisma.Decimal(String(item.cost))
        : null;
    const nameEnRaw =
      item.nameEn != null && item.nameEn !== ""
        ? String(item.nameEn)
        : item.name_en != null && item.name_en !== ""
          ? String(item.name_en)
          : null;
    const base = {
      name: String(item.name || "منتج"),
      nameEn: nameEnRaw?.trim() || null,
      description: item.description ? String(item.description) : null,
      sku: item.sku ? String(item.sku) : null,
      barcode: item.barcode ? String(item.barcode) : null,
      price: priceDec,
      cost: costDec,
      petType: mapPetType(item.category || item.petType),
      imageUrl: extractProductImageUrl(item),
      externalId: extId,
    };
    try {
      if (existing) {
        await prisma.product.update({
          where: { id: existing.id },
          data: {
            name: base.name,
            nameEn: base.nameEn,
            description: base.description,
            sku: base.sku,
            barcode: base.barcode,
            price: base.price,
            cost: base.cost,
            petType: base.petType,
            imageUrl: base.imageUrl,
          },
        });
      } else {
        await prisma.product.create({
          data: { ...base, organizationId },
        });
      }
      upserted++;
    } catch (e) {
      const isUniqueConflict =
        e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
      if (!isUniqueConflict) throw e;
      skipped++;
      if (skippedItems.length < 20) {
        skippedItems.push({
          externalId: extId,
          barcode: base.barcode,
          sku: base.sku,
          reason: "duplicate_unique_field",
        });
      }
    }
  }
  await prisma.syncSettings.update({
    where: { organizationId },
    data: { lastProductSyncAt: new Date() },
  });
  return {
    upserted,
    skipped,
    skippedItems,
    provider,
    at: new Date().toISOString(),
  };
}

/** رابط صورة من JSON الموقع — ليس رفع ملفات، فقط نسخ URL */
function extractProductImageUrl(item) {
  if (!item || typeof item !== "object") return null;
  const direct =
    item.imageUrl ??
    item.image_url ??
    item.image ??
    item.featured_image ??
    item.featuredImage ??
    item.thumbnail ??
    item.thumbnail_url ??
    item.coverImage ??
    item.coverImageUrl ??
    item.primaryImageUrl ??
    item.heroImage ??
    item.photo;
  if (direct != null && String(direct).trim() !== "") {
    return String(direct).trim().slice(0, 2000);
  }
  const fromArray = Array.isArray(item.images) ? item.images[0] : null;
  const fromNested =
    fromArray && typeof fromArray === "object"
      ? fromArray.src ??
        fromArray.url ??
        fromArray.source_url ??
        fromArray.image
      : null;
  if (fromNested != null && String(fromNested).trim() !== "") {
    return String(fromNested).trim().slice(0, 2000);
  }
  if (typeof item.images === "string" && item.images.trim()) {
    return String(item.images).trim().slice(0, 2000);
  }
  const media0 = Array.isArray(item.media) ? item.media[0] : null;
  if (media0 && typeof media0 === "object") {
    const u = media0.url ?? media0.src ?? media0.path;
    if (u != null && String(u).trim() !== "") return String(u).trim().slice(0, 2000);
  }
  return null;
}

function mapPetType(raw) {
  const s = String(raw || "").toLowerCase();
  if (s.includes("cat") || s.includes("قط")) return "CAT";
  if (s.includes("dog") || s.includes("كلب")) return "DOG";
  return "OTHER";
}

function detectProvider(baseUrl, apiKey) {
  const host = (() => {
    try {
      return new URL(String(baseUrl || "")).hostname.toLowerCase();
    } catch {
      return "";
    }
  })();
  const key = String(apiKey || "");
  if (host.endsWith(".myshopify.com")) return "shopify";
  if (key.includes(":") && key.toLowerCase().includes("ck_")) return "woocommerce";
  return "generic";
}

function toNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

async function readJsonOrThrow(res, hintPrefix) {
  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.text()).trim().slice(0, 400);
    } catch {}
    const err = new Error(`${hintPrefix}: HTTP ${res.status}${detail ? ` — ${detail}` : ""}`);
    err.statusCode = res.status;
    throw err;
  }
  return res.json();
}

async function fetchProductsByProvider(provider, baseUrl, apiKey) {
  const normalized = String(baseUrl || "").replace(/\/$/, "");
  if (provider === "shopify") {
    const res = await fetch(
      `${normalized}/admin/api/2024-10/products.json?status=active&limit=250`,
      {
        headers: {
          "X-Shopify-Access-Token": apiKey,
          Accept: "application/json",
        },
      }
    );
    const data = await readJsonOrThrow(res, "فشل جلب منتجات Shopify");
    const products = Array.isArray(data?.products) ? data.products : [];
    return products.map((p) => {
      const firstVar = Array.isArray(p.variants) ? p.variants[0] || {} : {};
      const firstImg = Array.isArray(p.images) ? p.images[0] : null;
      return {
        id: p.id,
        externalId: p.id,
        name: p.title,
        description: p.body_html || null,
        sku: firstVar?.sku || null,
        barcode: firstVar?.barcode || null,
        price: toNumber(firstVar?.price, 0),
        imageUrl: firstImg?.src || p.image?.src || null,
        category: Array.isArray(p.product_type) ? p.product_type[0] : p.product_type,
      };
    });
  }

  if (provider === "woocommerce") {
    const [ck, cs] = String(apiKey || "").split(":", 2);
    if (!ck || !cs) {
      throw new Error("مفتاح WooCommerce يجب أن يكون بالشكل: ck_xxx:cs_xxx");
    }
    const qp = new URLSearchParams({
      consumer_key: ck.trim(),
      consumer_secret: cs.trim(),
      per_page: "100",
      status: "publish",
    });
    const res = await fetch(`${normalized}/wp-json/wc/v3/products?${qp.toString()}`, {
      headers: { Accept: "application/json" },
    });
    const data = await readJsonOrThrow(res, "فشل جلب منتجات WooCommerce");
    const products = Array.isArray(data) ? data : [];
    return products.map((p) => ({
      id: p.id,
      externalId: p.id,
      name: p.name,
      description: p.description || p.short_description || null,
      sku: p.sku || null,
      barcode: p.meta_data?.find?.((m) => m?.key === "barcode")?.value || null,
      price: toNumber(p.regular_price || p.price, 0),
      imageUrl: Array.isArray(p.images) && p.images[0] ? p.images[0].src : null,
      category: Array.isArray(p.categories) && p.categories[0] ? p.categories[0].name : null,
    }));
  }

  const res = await fetch(`${normalized}/api/products`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  });
  const data = await readJsonOrThrow(
    res,
    "فشل جلب المنتجات من واجهة الموقع"
  );
  return Array.isArray(data) ? data : data.products || data.data || [];
}

async function fetchOrdersByProvider(provider, baseUrl, apiKey) {
  const normalized = String(baseUrl || "").replace(/\/$/, "");
  if (provider === "shopify") {
    const res = await fetch(
      `${normalized}/admin/api/2024-10/orders.json?status=open&fulfillment_status=unfulfilled&limit=100`,
      {
        headers: {
          "X-Shopify-Access-Token": apiKey,
          Accept: "application/json",
        },
      }
    );
    const data = await readJsonOrThrow(res, "فشل جلب طلبات Shopify");
    return Array.isArray(data?.orders) ? data.orders : [];
  }

  if (provider === "woocommerce") {
    const [ck, cs] = String(apiKey || "").split(":", 2);
    if (!ck || !cs) {
      throw new Error("مفتاح WooCommerce يجب أن يكون بالشكل: ck_xxx:cs_xxx");
    }
    const qp = new URLSearchParams({
      consumer_key: ck.trim(),
      consumer_secret: cs.trim(),
      per_page: "100",
      status: "processing,on-hold,pending",
    });
    const res = await fetch(`${normalized}/wp-json/wc/v3/orders?${qp.toString()}`, {
      headers: { Accept: "application/json" },
    });
    const data = await readJsonOrThrow(res, "فشل جلب طلبات WooCommerce");
    return Array.isArray(data) ? data : [];
  }

  const res = await fetch(`${normalized}/api/orders/pending`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  });
  return readJsonOrThrow(res, "فشل مزامنة الطلبات من واجهة الموقع");
}

/**
 * دفع الطلبات المحلية للموقع أو سحب طلبات جديدة — حسب تصميم API لديك
 */
export async function syncOrdersWithWebsite(organizationId) {
  const cfg = await getSyncConfig(organizationId);
  const key = getPlainSyncApiKey(cfg);
  if (!cfg.websiteBaseUrl || !key) {
    throw new Error("يجب حفظ عنوان الموقع و API Key أولاً");
  }
  const provider = detectProvider(cfg.websiteBaseUrl, key);
  const pulled = await fetchOrdersByProvider(provider, cfg.websiteBaseUrl, key);
  await prisma.syncSettings.update({
    where: { organizationId },
    data: { lastOrderSyncAt: new Date() },
  });
  return {
    message: "تم تسجيل وقت مزامنة الطلبات",
    provider,
    pulledCount: Array.isArray(pulled) ? pulled.length : 0,
    at: new Date().toISOString(),
  };
}
