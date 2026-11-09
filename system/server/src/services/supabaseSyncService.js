import { Prisma } from "../lib/prisma-client-bundle.js";
import { prisma } from "../lib/prisma.js";
import { resolveStoredImageUrl } from "../lib/productImageUrl.js";
import { getSupabaseServer } from "../lib/supabase.js";
import { getSyncConfig } from "./syncService.js";

function mapPetType(raw) {
  const s = String(raw || "OTHER").toUpperCase();
  if (s === "CAT") return "CAT";
  if (s === "DOG") return "DOG";
  return "OTHER";
}

/**
 * يفترض جداول في Supabase (انظر supabase/schema.sql):
 * brands, categories, products, inventory
 * وربط الفروع: ضع UUID فرع Supabase في Branch.supabaseId محلياً
 */
export async function syncFromSupabase(organizationId) {
  const sb = getSupabaseServer();
  if (!sb) {
    throw new Error(
      "اضبط SUPABASE_URL و SUPABASE_ANON_KEY في ملف .env داخل مجلد server"
    );
  }

  const brandMap = new Map();
  const { data: brandRows, error: bErr } = await sb.from("brands").select("*");
  if (bErr) throw new Error(`Supabase brands: ${bErr.message}`);
  for (const b of brandRows || []) {
    const sid = String(b.id);
    const row = await prisma.brand.upsert({
      where: {
        organizationId_supabaseId: { organizationId, supabaseId: sid },
      },
      create: {
        organizationId,
        supabaseId: sid,
        name: String(b.name || "—").slice(0, 500),
        nameEn: b.name_en != null ? String(b.name_en).slice(0, 500) : null,
      },
      update: {
        name: String(b.name || "—").slice(0, 500),
        nameEn: b.name_en != null ? String(b.name_en).slice(0, 500) : null,
      },
    });
    brandMap.set(sid, row.id);
  }

  const catMap = new Map();
  const { data: catRows, error: cErr } = await sb.from("categories").select("*");
  if (cErr) throw new Error(`Supabase categories: ${cErr.message}`);
  for (const c of catRows || []) {
    const sid = String(c.id);
    const row = await prisma.category.upsert({
      where: {
        organizationId_supabaseId: { organizationId, supabaseId: sid },
      },
      create: {
        organizationId,
        supabaseId: sid,
        name: String(c.name || "—").slice(0, 500),
        nameEn: c.name_en != null ? String(c.name_en).slice(0, 500) : null,
      },
      update: {
        name: String(c.name || "—").slice(0, 500),
        nameEn: c.name_en != null ? String(c.name_en).slice(0, 500) : null,
      },
    });
    catMap.set(sid, row.id);
  }

  const { data: prodRows, error: pErr } = await sb.from("products").select("*");
  if (pErr) throw new Error(`Supabase products: ${pErr.message}`);

  let productUpserted = 0;
  for (const p of prodRows || []) {
    const extId = String(p.id);
    const brandId = p.brand_id ? brandMap.get(String(p.brand_id)) : null;
    const categoryId = p.category_id ? catMap.get(String(p.category_id)) : null;
    let categoryLabel = null;
    if (categoryId) {
      const c = await prisma.category.findFirst({
        where: { id: categoryId, organizationId },
        select: { name: true },
      });
      categoryLabel = c?.name ?? null;
    }

    const data = {
      organizationId,
      name: String(p.name || "منتج").slice(0, 500),
      nameEn: p.name_en != null ? String(p.name_en).slice(0, 500) : null,
      description: p.description != null ? String(p.description) : null,
      sku: p.sku != null ? String(p.sku).slice(0, 200) : null,
      barcode: p.barcode != null ? String(p.barcode).slice(0, 200) : null,
      price: new Prisma.Decimal(String(p.price ?? 0)),
      cost:
        p.cost != null && p.cost !== ""
          ? new Prisma.Decimal(String(p.cost))
          : null,
      petType: mapPetType(p.pet_type),
      imageUrl:
        p.image_url != null ? resolveStoredImageUrl(p.image_url) : null,
      externalId: extId,
      brandId,
      categoryId,
      category: categoryLabel,
    };

    const existing = await prisma.product.findFirst({
      where: { organizationId, externalId: extId },
    });
    if (existing) {
      const { organizationId: _o, ...updateData } = data;
      await prisma.product.update({
        where: { id: existing.id },
        data: updateData,
      });
    } else {
      await prisma.product.create({ data });
    }
    productUpserted++;
  }

  const { data: invRows, error: iErr } = await sb.from("inventory").select("*");
  if (iErr) throw new Error(`Supabase inventory: ${iErr.message}`);

  const branches = await prisma.branch.findMany({
    where: { organizationId, supabaseId: { not: null } },
  });
  const branchBySupa = new Map(
    branches.map((x) => [String(x.supabaseId), x.id])
  );

  let inventoryUpserted = 0;
  let inventorySkipped = 0;
  for (const row of invRows || []) {
    const pid = row.product_id != null ? String(row.product_id) : "";
    const bid = row.branch_id != null ? String(row.branch_id) : "";
    const localBranchId = branchBySupa.get(bid);
    if (!localBranchId) {
      inventorySkipped++;
      continue;
    }
    const product = await prisma.product.findFirst({
      where: { organizationId, externalId: pid },
    });
    if (!product) {
      inventorySkipped++;
      continue;
    }
    const qty = Math.max(0, Math.floor(Number(row.quantity) || 0));
    const minLevel = Math.max(
      0,
      Math.floor(
        Number(row.min_stock_level ?? row.min_stock ?? 5) || 5
      )
    );
    await prisma.inventory.upsert({
      where: {
        productId_branchId: {
          productId: product.id,
          branchId: localBranchId,
        },
      },
      create: {
        productId: product.id,
        branchId: localBranchId,
        quantity: qty,
        minStockLevel: minLevel,
      },
      update: {
        quantity: qty,
        minStockLevel: minLevel,
      },
    });
    inventoryUpserted++;
  }

  await getSyncConfig(organizationId);
  await prisma.syncSettings.update({
    where: { organizationId },
    data: { lastSupabaseSyncAt: new Date() },
  });

  return {
    brands: brandRows?.length ?? 0,
    categories: catRows?.length ?? 0,
    products: productUpserted,
    inventory: inventoryUpserted,
    inventorySkipped,
    at: new Date().toISOString(),
  };
}
