/**
 * FR-92: every balance (variant at a location, or a product without variants at a location)
 * at or below its low-stock level. Inactive variants, products and locations are left out.
 */
export async function listLowStock(db, organizationId, branchId = null) {
  const branchWhere = {
    organizationId,
    isActive: true,
    ...(branchId ? { id: String(branchId) } : {}),
  };
  const [variantRows, productRows] = await Promise.all([
    db.variantStock.findMany({
      where: {
        quantity: { lte: db.variantStock.fields.minStockLevel },
        branch: branchWhere,
        variant: { isActive: true, organizationId, product: { isActive: true } },
      },
      include: {
        branch: { select: { id: true, name: true, nameEn: true, kind: true } },
        variant: {
          select: {
            id: true,
            label: true,
            labelEn: true,
            sku: true,
            product: { select: { id: true, name: true, nameEn: true, sku: true, sellBy: true } },
          },
        },
      },
      orderBy: { quantity: "asc" },
      take: 500,
    }),
    db.inventory.findMany({
      where: {
        quantity: { lte: db.inventory.fields.minStockLevel },
        branch: branchWhere,
        product: { organizationId, isActive: true, variants: { none: {} } },
      },
      include: {
        branch: { select: { id: true, name: true, nameEn: true, kind: true } },
        product: { select: { id: true, name: true, nameEn: true, sku: true, sellBy: true } },
      },
      orderBy: { quantity: "asc" },
      take: 500,
    }),
  ]);
  const rows = [
    ...variantRows.map((r) => ({
      id: r.id,
      kind: "VARIANT",
      productId: r.variant.product.id,
      variantId: r.variantId,
      branchId: r.branchId,
      quantity: r.quantity,
      minStockLevel: r.minStockLevel,
      product: r.variant.product,
      variant: { id: r.variant.id, label: r.variant.label, labelEn: r.variant.labelEn, sku: r.variant.sku },
      branch: r.branch,
    })),
    ...productRows.map((r) => ({
      id: r.id,
      kind: "PRODUCT",
      productId: r.productId,
      variantId: null,
      branchId: r.branchId,
      quantity: r.quantity,
      minStockLevel: r.minStockLevel,
      product: r.product,
      variant: null,
      branch: r.branch,
    })),
  ];
  rows.sort((a, b) => a.quantity - a.minStockLevel - (b.quantity - b.minStockLevel));
  return rows;
}
