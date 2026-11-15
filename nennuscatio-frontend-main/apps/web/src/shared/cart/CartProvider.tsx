"use client";

import { ORDER_LIMITS } from "@nennus-catio/contracts";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";

/** One cart line: product slug + pack code (D107), as the checkout API expects them. */
export interface CartLine {
  productId: string;
  variantId: string;
  quantity: number;
}

/** Versioned, so a later change of shape can ignore old saved carts instead of misreading them. */
export const CART_STORAGE_KEY = "nc-cart-v1";

const IDENTIFIER = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Reads a saved cart defensively: anything malformed is dropped, quantities kept within the order limits. */
export function parseStoredCart(raw: string | null): CartLine[] {
  if (!raw) return [];
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(value)) return [];
  const lines: CartLine[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const { productId, variantId, quantity } = entry as Record<string, unknown>;
    if (typeof productId !== "string" || typeof variantId !== "string" || typeof quantity !== "number") continue;
    if (!Number.isInteger(quantity) || productId.length > 120 || variantId.length > 120) continue;
    if (!IDENTIFIER.test(productId) || !IDENTIFIER.test(variantId)) continue;
    if (lines.some((line) => line.productId === productId && line.variantId === variantId)) continue;
    lines.push({ productId, variantId, quantity: Math.min(Math.max(quantity, 1), ORDER_LIMITS.maxQuantity) });
    if (lines.length === ORDER_LIMITS.maxLines) break;
  }
  return lines;
}

// Storage can be blocked (private windows, strict settings): the cart then lives in memory only.
function readStoredCart(): CartLine[] {
  try {
    return parseStoredCart(window.localStorage.getItem(CART_STORAGE_KEY));
  } catch {
    return [];
  }
}

function storeCart(lines: CartLine[]): void {
  try {
    if (lines.length) window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(lines));
    else window.localStorage.removeItem(CART_STORAGE_KEY);
  } catch {
    // Kept in memory for this visit.
  }
}

interface CartValue {
  cart: CartLine[];
  setCart: (lines: CartLine[]) => void;
  /** False until the saved cart has been read; pages show "loading", never "empty", before that. */
  ready: boolean;
}

const CartContext = createContext<CartValue | null>(null);

/**
 * The shopping cart, kept in this browser (7b-2): it survives refreshes, and other tabs follow
 * along. It is written only by `setCart`, never on first render, so the saved cart cannot be
 * replaced by the empty starting value before it has been read.
 */
export function CartProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ cart: CartLine[]; ready: boolean }>({ cart: [], ready: false });
  useEffect(() => {
    setState({ cart: readStoredCart(), ready: true });
    const follow = (event: StorageEvent) => {
      if (event.key === CART_STORAGE_KEY) setState({ cart: parseStoredCart(event.newValue), ready: true });
    };
    window.addEventListener("storage", follow);
    return () => window.removeEventListener("storage", follow);
  }, []);
  const setCart = useCallback((lines: CartLine[]) => {
    // The same quantity limits as a saved cart, applied on every change (review L12): a whole
    // number from 1 to the order maximum, whichever page changed it.
    const limited = lines.map((line) => ({
      ...line,
      quantity: Math.min(Math.max(Math.floor(line.quantity) || 1, 1), ORDER_LIMITS.maxQuantity),
    }));
    setState({ cart: limited, ready: true });
    storeCart(limited);
  }, []);
  const value = useMemo(() => ({ cart: state.cart, setCart, ready: state.ready }), [state, setCart]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartValue {
  const value = useContext(CartContext);
  if (!value) throw new Error("Cart provider missing");
  return value;
}
