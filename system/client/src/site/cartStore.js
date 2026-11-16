/** Website cart in localStorage. Every write tells the header so its count updates at once (FR-33). */
export const CART_KEY = "nennus.shopCart";
export const CART_EVENT = "nennus:cart";

export function readCart() {
  try {
    const rows = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

export function writeCart(rows) {
  localStorage.setItem(CART_KEY, JSON.stringify(rows));
  try {
    window.dispatchEvent(new CustomEvent(CART_EVENT, { detail: rows }));
  } catch {
    /* old browsers */
  }
}

/** Items in the cart: pieces count one each, a weighed line counts once. */
export function cartCount(rows = readCart()) {
  return rows.reduce((sum, line) => sum + (line.sellBy === "WEIGHT" ? 1 : Number(line.quantity) || 1), 0);
}
