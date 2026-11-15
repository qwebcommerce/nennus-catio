import { Prisma } from "./prisma-client-bundle.js";

export function sellByValue(raw) {
  return String(raw || "").toUpperCase() === "WEIGHT" ? "WEIGHT" : "PIECE";
}

function cleanUrl(raw) {
  const url = String(raw || "").trim();
  if (!url) return "";
  if (url.startsWith("/") || /^https?:\/\//i.test(url)) return url;
  return "";
}

export async function syncProductExtras(tx, { orgId, productId, body }) {
  if (!body) return;
  if (body.isPetHouse !== undefined || body.leadTimeDays !== undefined || body.houseDeliveryFee !== undefined || body.takesStock !== undefined) {
    const data = {};
    if (body.isPetHouse !== undefined) data.isPetHouse = Boolean(body.isPetHouse);
    if (body.takesStock !== undefined) data.takesStock = Boolean(body.takesStock);
    if (body.leadTimeDays !== undefined) {
      const days = Math.floor(Number(body.leadTimeDays));
      data.leadTimeDays = Number.isFinite(days) && days >= 0 ? days : null;
    }
    if (body.houseDeliveryFee !== undefined) {
      const fee = Number(body.houseDeliveryFee);
      data.houseDeliveryFee = new Prisma.Decimal((Number.isFinite(fee) && fee >= 0 ? fee : 0).toFixed(2));
    }
    await tx.product.update({ where: { id: productId }, data });
  }
  if (body.sellBy !== undefined) {
    await tx.product.update({
      where: { id: productId },
      data: { sellBy: sellByValue(body.sellBy) },
    });
  }
  if (body.preferredSupplierId !== undefined) {
    const supplierId = body.preferredSupplierId ? String(body.preferredSupplierId) : null;
    if (supplierId) {
      const supplier = await tx.supplier.findFirst({ where: { id: supplierId, organizationId: orgId } });
      if (!supplier) throw new Error("Preferred supplier was not found");
    }
    await tx.product.update({
      where: { id: productId },
      data: { preferredSupplierId: supplierId },
    });
  }
  if (Array.isArray(body.gallery)) {
    const urls = body.gallery.map(cleanUrl).filter(Boolean).slice(0, 8);
    await tx.product.update({ where: { id: productId }, data: { gallery: urls } });
  }
  if (Array.isArray(body.petTypeIds)) {
    const ids = [...new Set(body.petTypeIds.map((id) => String(id || "").trim()).filter(Boolean))];
    const found = ids.length
      ? await tx.catalogPetType.findMany({ where: { organizationId: orgId, id: { in: ids } }, select: { id: true } })
      : [];
    await tx.productPetType.deleteMany({ where: { productId } });
    if (found.length) {
      await tx.productPetType.createMany({
        data: found.map((row) => ({ productId, petTypeId: row.id })),
      });
    }
  }
  if (Array.isArray(body.variants)) {
    for (const raw of body.variants) {
      const label = String(raw?.label || raw?.labelEn || "").trim();
      const price = Number(raw?.price);
      if (!label || !Number.isFinite(price) || price < 0) continue;
      const supplierId = raw?.preferredSupplierId ? String(raw.preferredSupplierId) : null;
      if (supplierId) {
        const supplier = await tx.supplier.findFirst({ where: { id: supplierId, organizationId: orgId } });
        if (!supplier) throw new Error("Preferred supplier was not found");
      }
      const data = {
        label,
        labelEn: raw?.labelEn ? String(raw.labelEn).trim() : null,
        sku: raw?.sku ? String(raw.sku).trim() : null,
        barcode: raw?.barcode ? String(raw.barcode).trim() : null,
        price: new Prisma.Decimal(price.toFixed(2)),
        isActive: raw?.isActive !== false,
        packWeight:
          raw?.packWeight != null && raw.packWeight !== "" && Number.isFinite(Number(raw.packWeight))
            ? new Prisma.Decimal(Number(raw.packWeight).toFixed(3))
            : null,
        preferredSupplierId: supplierId,
      };
      if (raw?.id) {
        await tx.productVariant.updateMany({
          where: { id: String(raw.id), productId, organizationId: orgId },
          data,
        });
      } else {
        await tx.productVariant.create({
          data: { ...data, productId, organizationId: orgId },
        });
      }
    }
  }
}
