"use client";
import {
  createContext,
  useContext,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { CartProvider } from "@/shared/cart/CartProvider";
import { mockBusinessRepository } from "./adapters/business-repository";
import type { GroomingLocation } from "./data/business";
// The cart moved to a shared, browser-saved store in 7b-2; re-exported so existing imports work.
export { useCart } from "@/shared/cart/CartProvider";
const serverState = mockBusinessRepository.getSnapshot();
const GroomingDraftContext = createContext<{
  location: GroomingLocation;
  address: string;
  setDraft: (draft: { location: GroomingLocation; address: string }) => void;
} | null>(null);
export function MockDataProvider({ children }: { children: ReactNode }) {
  const [groomingDraft, setGroomingDraft] = useState<{
    location: GroomingLocation;
    address: string;
  }>({ location: "in-store", address: "" });
  return (
    <CartProvider>
      <GroomingDraftContext.Provider
        value={{ ...groomingDraft, setDraft: setGroomingDraft }}
      >
        {children}
      </GroomingDraftContext.Provider>
    </CartProvider>
  );
}
export function useBusiness() {
  return useSyncExternalStore(
    mockBusinessRepository.subscribe,
    mockBusinessRepository.getSnapshot,
    () => serverState,
  );
}
export function useGroomingBookingDraft() {
  const value = useContext(GroomingDraftContext);
  if (!value) throw new Error("Grooming booking draft provider missing");
  return value;
}
export const repo = mockBusinessRepository;
