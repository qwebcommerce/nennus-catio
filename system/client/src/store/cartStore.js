import { create } from "zustand";

/**
 * حالة سلة POS — كميات وأسعار لكل فرع
 */
function pickUnitPrice(product, useWholesale) {
  const retail = Number(product.price);
  const w = product.wholesalePrice != null ? Number(product.wholesalePrice) : null;
  if (useWholesale && w != null && !Number.isNaN(w)) return w;
  return retail;
}

function pickCost(product) {
  if (product.cost == null || product.cost === "") return null;
  const c = Number(product.cost);
  return Number.isNaN(c) ? null : c;
}

function normalizeModifiers(mods) {
  if (!Array.isArray(mods) || !mods.length) return [];
  const out = [];
  const seen = new Set();
  for (const m of mods) {
    const key = String(m?.key || "").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      key,
      label: String(m?.label || key).trim(),
      labelAr: m?.labelAr ? String(m.labelAr).trim() : null,
      priceDelta: Math.round((Number(m?.priceDelta) || 0) * 100) / 100,
    });
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

export function cartLineKey(productId, modifiers) {
  const mods = normalizeModifiers(modifiers);
  if (!mods.length) return String(productId);
  return `${productId}::${mods.map((m) => m.key).join(",")}`;
}

function unitPriceWithMods(product, useWholesale, modifiers) {
  const base = pickUnitPrice(product, useWholesale);
  const delta = normalizeModifiers(modifiers).reduce((s, m) => s + m.priceDelta, 0);
  return Math.round((base + delta) * 100) / 100;
}

function mapCartLine(i) {
  const modifiers = normalizeModifiers(i.modifiers);
  const productId = i.productId;
  return {
    lineKey: i.lineKey || cartLineKey(productId, modifiers),
    productId,
    name: i.name,
    nameEn: i.nameEn ?? null,
    imageUrl: i.imageUrl,
    petType: i.petType,
    unitPrice: Number(i.unitPrice),
    cost: i.cost != null ? Number(i.cost) : null,
    quantity: Math.max(1, Math.floor(Number(i.quantity) || 1)),
    maxStock: Math.max(0, Math.floor(Number(i.maxStock) || 0)),
    modifiers,
  };
}

export const useCartStore = create((set, get) => ({
  branchId: null,
  items: [],
  /** عند true تُستخدم أسعار الجملة في السلة (إن وُجدت) */
  useWholesalePricing: false,

  setBranchId: (branchId) => set({ branchId }),

  setUseWholesalePricing: (v) => set({ useWholesalePricing: Boolean(v) }),

  /** يحدّث أسطر السلة من أسعار الكتالوج الحالية (بعد جلب المنتجات أو تغيير وضع الجملة) */
  syncLinePricesFromProducts: (products) =>
    set((state) => {
      const map = new Map(products.map((p) => [p.id, p]));
      return {
        items: state.items.map((i) => {
          const p = map.get(i.productId);
          if (!p) return i;
          return {
            ...i,
            unitPrice: unitPriceWithMods(p, state.useWholesalePricing, i.modifiers),
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
   * @param {{ modifiers?: object[] }} [opts]
   */
  addProduct: (product, qty = 1, opts = {}) => {
    const inv = product.inventories?.[0];
    const stock = inv?.quantity ?? 0;
    const useW = get().useWholesalePricing;
    const modifiers = normalizeModifiers(opts.modifiers);
    const lineKey = cartLineKey(product.id, modifiers);
    const unitPrice = unitPriceWithMods(product, useW, modifiers);
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
                  name: product.name,
                  nameEn: product.nameEn || null,
                  unitPrice,
                  cost,
                  modifiers,
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
            name: product.name,
            nameEn: product.nameEn || null,
            imageUrl: product.imageUrl,
            petType: product.petType,
            unitPrice,
            cost,
            quantity: qty,
            maxStock: stock,
            modifiers,
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
    return items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  },
}));
