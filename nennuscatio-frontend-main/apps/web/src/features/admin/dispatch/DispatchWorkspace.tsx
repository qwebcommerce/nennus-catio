"use client";
import { Search } from "lucide-react";
import {
  createContext,
  useContext,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { mockDispatchRepository } from "@/mocks/adapters/dispatch-repository";
import { useCopy } from "@/shared/lib/copy";
const Context = createContext<{
  search: string;
  setSearch: (value: string) => void;
} | null>(null);
export function DispatchWorkspaceProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [search, setSearch] = useState("");
  return (
    <Context.Provider value={{ search, setSearch }}>
      {children}
    </Context.Provider>
  );
}
export function useDispatchWorkspace() {
  const value = useContext(Context);
  if (!value) throw new Error("Dispatch workspace missing");
  return value;
}
export function useDispatchChanges() {
  return useSyncExternalStore(
    mockDispatchRepository.subscribe,
    mockDispatchRepository.getSnapshot,
    mockDispatchRepository.getServerSnapshot,
  );
}
export function DispatchHeaderSearch() {
  const c = useCopy(),
    { search, setSearch } = useDispatchWorkspace();
  return (
    <label className="admin-search search-field">
      <Search size={16} aria-hidden="true" />
      <input
        aria-label={c.text(
          "Search all dispatches",
          "ابحث في جميع مهام التوصيل",
        )}
        placeholder={c.text(
          "Search dispatches, reference, customer, location…",
          "ابحث عن التوصيل والمرجع والعميل والموقع…",
        )}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
    </label>
  );
}
