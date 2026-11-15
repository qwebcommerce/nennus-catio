"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import { ChevronDown, Plus, Search } from "lucide-react";
import type { Promotion } from "@/mocks/data/promotions";
import { useCopy } from "@/shared/lib/copy";
const Context = createContext<{
  search: string;
  setSearch: (value: string) => void;
  editing: Promotion | null | undefined;
  setEditing: (value: Promotion | null | undefined) => void;
} | null>(null);
export function PromotionsWorkspaceProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [search, setSearch] = useState(""),
    [editing, setEditing] = useState<Promotion | null | undefined>();
  return (
    <Context.Provider value={{ search, setSearch, editing, setEditing }}>
      {children}
    </Context.Provider>
  );
}
export function usePromotionsWorkspace() {
  const context = useContext(Context);
  if (!context) throw new Error("Promotions workspace provider missing");
  return context;
}
export function PromotionsHeaderSearch() {
  const c = useCopy(),
    { search, setSearch } = usePromotionsWorkspace();
  return (
    <label className="admin-search search-field">
      <Search size={16} aria-hidden="true" />
      <input
        aria-label={c.text(
          "Search promotions, products, services",
          "ابحث عن العروض والمنتجات والخدمات",
        )}
        placeholder={c.text(
          "Search promotions, products, services…",
          "ابحث عن العروض والمنتجات والخدمات…",
        )}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
    </label>
  );
}
export function PromotionsCreateButton() {
  const c = useCopy(),
    { setEditing } = usePromotionsWorkspace();
  return (
    <button
      className="promo-create"
      type="button"
      onClick={() => setEditing(null)}
    >
      <Plus size={15} />
      {c.text("Create Promotion", "إنشاء عرض")}
      <ChevronDown size={12} aria-hidden="true" />
    </button>
  );
}
