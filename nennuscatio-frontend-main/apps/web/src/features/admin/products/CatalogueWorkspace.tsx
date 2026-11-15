"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ChevronDown,
  House,
  Plus,
  Scissors,
  Search,
  ShoppingBag,
} from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { useRepositories } from "@/shared/api/DataSourceProvider";
import { useCopy } from "@/shared/lib/copy";
export type CatalogueSection = "products" | "houses" | "services";
const Context = createContext<{
  search: string;
  setSearch: (value: string) => void;
  create: CatalogueSection | null;
  setCreate: (kind: CatalogueSection | null) => void;
} | null>(null);
export function CatalogueWorkspaceProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [search, setSearch] = useState(""),
    [create, setCreate] = useState<CatalogueSection | null>(null);
  return (
    <Context.Provider value={{ search, setSearch, create, setCreate }}>
      {children}
    </Context.Provider>
  );
}
export function useCatalogueWorkspace() {
  const value = useContext(Context);
  if (!value) throw new Error("Catalogue provider missing");
  return value;
}
export function CatalogueHeaderSearch() {
  const c = useCopy(),
    { search, setSearch } = useCatalogueWorkspace();
  return (
    <label className="admin-search search-field">
      <Search size={16} aria-hidden="true" />
      <input
        aria-label={c.text("Search catalogue", "ابحث في الكتالوج")}
        placeholder={c.text(
          "Search products, houses, services…",
          "ابحث عن المنتجات والبيوت والخدمات…",
        )}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
    </label>
  );
}
export function CatalogueCreateMenu({ header = false }: { header?: boolean }) {
  const c = useCopy(),
    { setCreate } = useCatalogueWorkspace(),
    { source } = useRepositories(),
    router = useRouter(),
    ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (
        e.target instanceof Node &&
        !ref.current?.contains(e.target) &&
        ref.current
      )
        ref.current.open = false;
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  return (
    <details
      ref={ref}
      className="admin-catalogue-create"
      onKeyDown={(e) => {
        if (e.key === "Escape" && ref.current) {
          ref.current.open = false;
          ref.current.querySelector("summary")?.focus();
        }
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget))
          e.currentTarget.open = false;
      }}
    >
      <summary>
        <Plus size={16} />
        {header ? c.text("Create", "إنشاء") : c.text("Add New", "إضافة جديد")}
        <ChevronDown size={12} />
      </summary>
      <div>
        {(
          [
            {
              id: "products",
              en: "Add Product",
              ar: "إضافة منتج",
              icon: ShoppingBag,
            },
            {
              id: "houses",
              en: "Add Pet House",
              ar: "إضافة بيت للحيوان",
              icon: House,
            },
            // API mode: grooming packages have their own page (9a).
            source === "api"
              ? { id: "services" as const, en: "Grooming packages", ar: "باقات العناية", icon: Scissors }
              : {
                  id: "services" as const,
                  en: "Configure Grooming Package",
                  ar: "إعداد باقة عناية",
                  icon: Scissors,
                },
          ] as const
        ).map((item) => (
          <button
            type="button"
            key={item.id}
            onClick={() => {
              if (item.id === "services" && source === "api") router.push("/admin/grooming-packages");
              else setCreate(item.id);
              if (ref.current) {
                ref.current.open = false;
                ref.current.querySelector("summary")?.focus();
              }
            }}
          >
            <item.icon size={18} />
            {c.text(item.en, item.ar)}
          </button>
        ))}
      </div>
    </details>
  );
}
