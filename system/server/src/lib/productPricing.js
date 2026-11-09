import { Prisma } from "./prisma-client-bundle.js";

/**
 * سعر البيع المستخدم في الفاتورة: تجزئة (price) أو جملة (wholesalePrice) عند التفعيل.
 * @param {{ price: unknown, wholesalePrice?: unknown|null }} product
 * @param {boolean} useWholesale
 */
export function unitPriceDecimalForSale(product, useWholesale) {
  if (useWholesale && product.wholesalePrice != null && product.wholesalePrice !== "") {
    return new Prisma.Decimal(product.wholesalePrice);
  }
  return new Prisma.Decimal(product.price);
}
