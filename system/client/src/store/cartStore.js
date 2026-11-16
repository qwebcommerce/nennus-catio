import { create } from "zustand";

/**
 * حالة سلة POS — كميات وأسعار لكل فرع
 */
function pickUnitPrice(product) {
  return Math.round(Number(product.price) * 100) / 100;
}

function pickCost(product) {
  if (product.cost == null || product.cost === "") return null;
  const c = Number(product.cost);
  return Number.isNaN(c) ? null : c;
}

export function cartLineKey(productId, variantId) {
  return variantId ? `${productId}:${variantId}` : String(productId);
}

export function lineAmount(line) {
  const price = Number(line.unitPrice) || 0;
  const qty = Number(line.quantity) || 0;
  if (line.sellBy === "WEIGHT") return Math.round(price * (qty / 1000) * 100) / 100;
  return Math.round(price * qty * 100) / 100;
}

function mapCartLine(i) {
  const productId = i.productId;
  return {
    lineKey: i.lineKey || cartLineKey(productId, i.variantId),
    productId,
    variantId: i.variantId || null,
    variantLabel: i.variantLabel || null,
    sellBy: i.sellBy === "WEIGHT" ? "WEIGHT" : "PIECE",
    name: i.name,
    nameEn: i.nameEn ?? null,
    imageUrl: i.imageUrl,
    petType: i.petType,
    unitPrice: Number(i.unitPrice),
    cost: i.cost != null ? Number(i.cost) : null,
    quantity: Math.max(1, Math.floor(Number(i.quantity) || 1)),
    maxStock: Math.max(0, Math.floor(Number(i.maxStock) || 0)),
  };
}

export const useCartStore = create((set, get) => ({
  branchId: null,
  items: [],
  setBranchId: (branchId) => set({ branchId }),

  /** يحدّث أسطر السلة من أسعار الكتالوج الحالية (بعد جلب المنتجات) */
  syncLinePricesFromProducts: (products) =>
    set((state) => {
      const map = new Map(products.map((p) => [p.id, p]));
      return {
        items: state.items.map((i) => {
          const p = map.get(i.productId);
          if (!p) return i;
          return {
            ...i,
            unitPrice: pickUnitPrice(p),
            cost: pickCost(p),
            name: p.name,
            nameEn: p.nameEn || null,
          };
        }),
      };
    }),

  /**
   * @param {object} product
   * @param {number} qty
   * @param {{ variant?: object }} [opts]
   */
  addProduct: (product, qty = 1, opts = {}) => {
    const variant = opts.variant || null;
    const sellBy = product.sellBy === "WEIGHT" ? "WEIGHT" : "PIECE";
    const stock = variant
      ? variant.stocks?.[0]?.quantity ?? 0
      : product.inventories?.[0]?.quantity ?? 0;
    const lineKey = cartLineKey(product.id, variant?.id);
    const unitPrice = variant ? Number(variant.price) : pickUnitPrice(product);
    const cost = pickCost(product);
    set((state) => {
      const existing = state.items.find((i) => i.lineKey === lineKey);
      const nextQty = (existing?.quantity ?? 0) + qty;
      if (nextQty > stock) return state;
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.lineKey === lineKey
              ? {
                  ...i,
                  quantity: nextQty,
                  name: variant ? `${product.name} · ${variant.label}` : product.name,
                  nameEn: variant
                    ? `${product.nameEn || product.name} · ${variant.labelEn || variant.label}`
                    : product.nameEn || null,
                  unitPrice,
                  cost,
                }
              : i
          ),
        };
      }
      return {
        items: [
          ...state.items,
          {
            lineKey,
            productId: product.id,
            variantId: variant?.id || null,
            variantLabel: variant?.label || null,
            sellBy,
            name: variant ? `${product.name} · ${variant.label}` : product.name,
            nameEn: variant
              ? `${product.nameEn || product.name} · ${variant.labelEn || variant.label}`
              : product.nameEn || null,
            imageUrl: product.imageUrl,
            petType: product.petType,
            unitPrice,
            cost,
            quantity: qty,
            maxStock: stock,
          },
        ],
      };
    });
  },

  setQuantity: (lineKey, quantity) => {
    const q = Math.max(1, Math.floor(quantity));
    set((state) => ({
      items: state.items.map((i) => {
        if (i.lineKey !== lineKey) return i;
        const max = i.maxStock ?? q;
        return { ...i, quantity: Math.min(q, max) };
      }),
    }));
  },

  removeLine: (lineKey) =>
    set((state) => ({
      items: state.items.filter((i) => i.lineKey !== lineKey),
    })),

  clear: () => set({ items: [] }),

  /** استرجاع سلة معلّقة — يجب أن تكون الأصناف بنفس شكل عناصر السلة */
  replaceAll: (items) =>
    set({
      items: Array.isArray(items) ? items.map(mapCartLine) : [],
    }),

  total: () => {
    const items = get().items;
    return items.reduce((s, i) => s + lineAmount(i), 0);
  },
}));
