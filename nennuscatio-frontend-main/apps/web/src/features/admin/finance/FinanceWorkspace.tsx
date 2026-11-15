"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import { useCopy } from "@/shared/lib/copy";
const FinanceContext = createContext<{ search: string; setSearch: (v: string) => void } | null>(null);
export function FinanceWorkspaceProvider({ children }: { children: ReactNode }) {
  const [search, setSearch] = useState("");
  return <FinanceContext.Provider value={{ search, setSearch }}>{children}</FinanceContext.Provider>;
}
export function useFinanceWorkspace() {
  const value = useContext(FinanceContext);
  if (!value) throw new Error("Finance workspace provider missing");
  return value;
}
export function FinanceHeaderSearch() {
  const c = useCopy(), { search, setSearch } = useFinanceWorkspace();
  return <label className="admin-search finance-header-search search-field">
    <Search size={16} aria-hidden="true" />
    <input value={search} onChange={(e) => setSearch(e.target.value)}
      aria-label={c.text("Search financial records", "ابحث في السجلات المالية")}
      placeholder={c.text("Search transactions, customers, orders…", "ابحث عن المعاملات والعملاء والطلبات…")} />
  </label>;
}
