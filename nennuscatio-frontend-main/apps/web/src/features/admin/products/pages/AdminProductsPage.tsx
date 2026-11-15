"use client";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import {
  ArrowDownUp,
  ChevronLeft,
  ChevronRight,
  Filter,
  House,
  MoreHorizontal,
  PlugZap,
  Scissors,
  Search,
  ShoppingBag,
} from "lucide-react";
import { useBusiness } from "@/mocks/MockDataProvider";
import {
  bi,
  cataloguePetTypes,
  petCategories,
  type Package,
  type Product,
  type Variant,
} from "@/mocks/data/business";
import { assets } from "@/mocks/data/assets";
import { emptyHouseMetadata } from "@/mocks/data/pet-houses";
import { useCopy } from "@/shared/lib/copy";
import { AdminPage, Empty, ErrorMessage, Field, Modal } from "@/shared/ui/BusinessUI";
import { DownloadMenu } from "@/shared/ui/DownloadMenu";
import { Photo } from "@/shared/ui/Photo";
import { useDashboardDate } from "@/features/admin/dashboard/components/DashboardDate";
import { PackageEditor } from "@/features/admin/grooming-packages/components/PackageEditor";
import {
  CatalogueCreateMenu,
  useCatalogueWorkspace,
  type CatalogueSection,
} from "../CatalogueWorkspace";
import {
  CatalogueDetail,
  CatalogueStatus,
  StockBadge,
} from "../components/CatalogueDetail";
import { PosItemsPanel } from "../components/PosItemsPanel";
import { ProductEditor } from "../components/ProductEditor";
import { stockState } from "../lib/catalogue";
import { CategoriesManager } from "../components/CategoriesManager";
import { useAdminCatalog, useAdminCategories, useCategoryOptions } from "@/shared/api/admin-catalog";
import { houseReadiness, readinessLabel } from "@/features/pet-houses/lib/readiness";
import { useAdminAccess } from "@/shared/access/AdminAccess";
import { CatalogState } from "@/shared/ui/CatalogState";
import { NumberInput } from "@/shared/ui/NumberInput";
export function AdminProductsPage() {
  const c = useCopy(),
    data = useBusiness(),
    catalog = useAdminCatalog(),
    categories = useCategoryOptions(),
    access = useAdminAccess(),
    workspace = useCatalogueWorkspace(),
    { date } = useDashboardDate();
  // "pos": the POS items tab (#16 part 2c), API mode only; `?section=pos` opens it (the bell, Integrations).
  // (`?.`: outside the App Router, as in the component tests, there are no search params.)
  const linkedSection = useSearchParams()?.get("section") === "pos" && catalog.source === "api" ? "pos" : null;
  const [section, setSection] = useState<CatalogueSection | "pos">(linkedSection ?? "products"),
    [category, setCategory] = useState(""),
    [pet, setPet] = useState(""),
    [stock, setStock] = useState(""),
    [readiness, setReadiness] = useState(""),
    [status, setStatus] = useState(""),
    [brand, setBrand] = useState(""),
    [minPrice, setMinPrice] = useState(""),
    [more, setMore] = useState(false),
    [sort, setSort] = useState({ key: "id", desc: false }),
    [size, setSize] = useState(10),
    [paging, setPaging] = useState({ key: "", page: 1 }),
    [selected, setSelected] = useState(""),
    [checked, setChecked] = useState<string[]>([]),
    [editing, setEditing] = useState<Product | Package | null>(null),
    [addingPack, setAddingPack] = useState<Variant | null>(null),
    [packageId, setPackageId] = useState(""),
    [managingCategories, setManagingCategories] = useState(false),
    [downloadError, setDownloadError] = useState("");
  const detailTrigger = useRef<HTMLButtonElement | null>(null);
  // A link to the tab while the page is already open (the bell) switches to it.
  useEffect(() => {
    if (linkedSection) setSection(linkedSection);
  }, [linkedSection]);
  const created = useMemo<Product | null>(
    () =>
      workspace.create && workspace.create !== "services"
        ? {
            id: crypto.randomUUID(),
            name: bi("", ""),
            description: bi("", ""),
            category: workspace.create === "houses" ? "pet-houses" : "food",
            pet: "cats",
            image: workspace.create === "houses" ? "" : assets.essentials,
            active: true,
            ...(workspace.create === "houses"
              ? { house: emptyHouseMetadata(), gallery: [] }
              : {}),
            variants: [
              {
                id: crypto.randomUUID(),
                label: bi("1 piece", "قطعة"),
                sku: "",
                price: 0,
                stock: 0,
                unit: "piece",
              },
            ],
          }
        : null,
    [workspace.create],
  );
  // Products and Pet Houses come from the API (6b). In API mode grooming Services have their own page
  // (9a), so the Services tab links there; the demo keeps its sample Services here.
  const products = catalog.products.filter((p) => !p.house),
    houses = catalog.products.filter((p) => !!p.house);
  // A hidden Pet Houses category hides every model (#14): the readiness marks say so.
  const adminCategories = useAdminCategories(),
    housesShown = catalog.source !== "api" || (adminCategories.data?.find((x) => x.isHouseCategory)?.active ?? true);
  const records: (Product | Package)[] =
    section === "services"
      ? data.packages
      : section === "houses"
        ? houses
        : products;
  const search = workspace.search.trim().toLowerCase();
  const rows = records
    .filter((r) => {
      const product = "variants" in r ? r : null;
      const text = [
        r.id,
        r.name.en,
        r.name.ar,
        r.description.en,
        r.description.ar,
        product?.brand,
        ...(product?.variants.map((v) => v.sku) ?? []),
      ]
        .join(" ")
        .toLowerCase();
      return (
        (!search || text.includes(search)) &&
        (!category ||
          (product
            ? product.category === category
            : "tier" in r && r.tier === category)) &&
        (!pet ||
          (product
            ? product.pet === pet
            : "petCategory" in r && r.petCategory === pet)) &&
        (!status || r.active === (status === "active")) &&
        // A made-to-order house has no stock to count, so the stock filter leaves it out.
        (!stock || (product && product.house?.availability !== "made-to-order" && stockState(product.variants) === stock)) &&
        (!readiness || (product?.house && (houseReadiness(product, housesShown).gaps.length === 0) === (readiness === "ready"))) &&
        (!brand ||
          product?.brand?.toLowerCase().includes(brand.toLowerCase())) &&
        (!minPrice ||
          (product
            ? product.variants.some((v) => v.price >= Number(minPrice) * 100)
            : "price" in r && r.price >= Number(minPrice) * 100))
      );
    })
    .sort((a, b) => {
      function value(r: Product | Package) {
        if (sort.key === "name") return c.local(r.name);
        if (sort.key === "category")
          return "category" in r ? r.category : r.tier;
        if (sort.key === "pet") return "pet" in r ? r.pet : r.petCategory;
        if (sort.key === "variants")
          return "variants" in r ? r.variants.length : r.price;
        if (sort.key === "stock")
          return "variants" in r
            ? r.variants.reduce((n, v) => n + v.stock, 0)
            : r.duration;
        if (sort.key === "status") return Number(r.active);
        return r.id;
      }
      const x = value(a),
        y = value(b),
        result =
          typeof x === "number" && typeof y === "number"
            ? x - y
            : String(x).localeCompare(String(y), c.locale, { numeric: true });
      return sort.desc ? -result : result;
    });
  const key = JSON.stringify([
      section,
      search,
      category,
      pet,
      stock,
      readiness,
      status,
      brand,
      minPrice,
      size,
      sort,
    ]),
    pages = Math.max(1, Math.ceil(rows.length / size)),
    page = Math.min(paging.key === key ? paging.page : 1, pages),
    visible = rows.slice((page - 1) * size, page * size),
    record = records.find((r) => r.id === selected),
    editor = editing ?? created;
  function setPage(n: number) {
    setPaging({ key, page: n });
  }
  function changeSection(next: CatalogueSection | "pos") {
    setSection(next);
    setCategory("");
    setPet("");
    setStock("");
    setReadiness("");
    setStatus("");
    setBrand("");
    setMinPrice("");
    setSelected("");
    setChecked([]);
  }
  function closeDetails() {
    setSelected("");
    detailTrigger.current?.focus();
  }
  function sortBy(next: string) {
    setSort({ key: next, desc: sort.key === next ? !sort.desc : false });
  }
  const titles = {
    products: c.text("Products", "المنتجات"),
    houses: c.text("Pet Houses", "بيوت الحيوانات"),
    services: c.text("Services", "الخدمات"),
    pos: c.text("POS items", "أصناف نقطة البيع"),
  };
  return (
    <AdminPage
      module="products"
      title={c.text("Catalogue", "الكتالوج")}
      subtitle={c.text(
        "Manage everything customers can shop or book.",
        "إدارة كل ما يمكن للعملاء شراؤه أو حجزه.",
      )}
      actions={
        <>
          {catalog.source === "api" && access.can("products", "edit") && (
            <button type="button" className="button button--secondary" onClick={() => setManagingCategories(true)}>
              {c.text("Categories", "الفئات")}
            </button>
          )}
          {/* Every pack of every product, Pet Houses included (#12 part 2). */}
          {catalog.source === "api" && access.can("products", "export") && (
            <DownloadMenu path="/admin/catalog/products" onError={setDownloadError} />
          )}
          <CatalogueCreateMenu />
        </>
      }
    >
      <ErrorMessage message={downloadError} />
      <div
        className={`admin-catalogue-layout ${record ? "admin-catalogue-layout--detail" : ""}`}
      >
        <div className="admin-catalogue-workspace">
          <div className="admin-catalogue-toolbar">
            <nav
              className="admin-catalogue-tabs"
              aria-label={c.text("Catalogue sections", "أقسام الكتالوج")}
            >
              {(
                [
                  { id: "products", icon: ShoppingBag, count: products.length },
                  { id: "houses", icon: House, count: houses.length },
                  // Every code the POS has sent (#16 part 2c); its count is on the tab itself.
                  ...(catalog.source === "api" ? [{ id: "pos" as const, icon: PlugZap, count: null }] : []),
                  {
                    id: "services",
                    icon: Scissors,
                    count: data.packages.length,
                  },
                ] satisfies { id: CatalogueSection | "pos"; icon: typeof PlugZap; count: number | null }[]
              ).map((tab) =>
                tab.id === "services" && catalog.source === "api" ? (
                  <Link key={tab.id} href="/admin/grooming-packages" className="admin-catalogue-tab-link">
                    <tab.icon size={23} />
                    {titles[tab.id]}
                  </Link>
                ) : (
                  <button
                    type="button"
                    key={tab.id}
                    aria-pressed={section === tab.id}
                    onClick={() => changeSection(tab.id)}
                  >
                    <tab.icon size={23} />
                    {titles[tab.id]}
                    {tab.count !== null && ` (${tab.count})`}
                  </button>
                ),
              )}
            </nav>
          </div>
          {section === "pos" ? (
            <PosItemsPanel
              products={catalog.products}
              categories={categories}
              onCreate={(product) => setEditing(product)}
              onAddPack={(product, pack) => {
                setAddingPack(pack);
                setEditing(product);
              }}
              onOpen={(product) => setEditing(product)}
            />
          ) : (
            <section
              className="admin-catalogue-card"
              aria-label={titles[section]}
            >
              <h2>
                {titles[section]} ({records.length})
              </h2>
              <p className="admin-catalogue-subtitle">
                {section === "products"
                  ? c.text(
                      "Manage all retail products shown in the customer shop.",
                      "إدارة المنتجات المعروضة في متجر العملاء.",
                    )
                  : section === "houses"
                    ? c.text(
                        "Ready-made models in Shop and the separate Pet Houses page.",
                        "الموديلات الجاهزة في المتجر وصفحة بيوت الحيوانات.",
                      )
                    : c.text(
                        "Configure the eight approved pet-category × Basic/Full combinations.",
                        "إعداد التركيبات الثمانية المعتمدة للفئات والباقات الأساسية والكاملة.",
                      )}
              </p>
              <div className="admin-catalogue-filters">
                <label className="admin-catalogue-search">
                  <Search size={15} />
                  <input
                    aria-label={c.text(
                      "Search catalogue records",
                      "ابحث في سجلات الكتالوج",
                    )}
                    placeholder={c.text(
                      `Search ${section === "houses" ? "pet houses" : section === "services" ? "services" : "products"}…`,
                      "ابحث في السجلات…",
                    )}
                    value={workspace.search}
                    onChange={(e) => workspace.setSearch(e.target.value)}
                  />
                </label>
                <select
                  aria-label={c.text("Catalogue category", "فئة الكتالوج")}
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="">
                    {c.text(
                      section === "services" ? "Package" : "Category",
                      section === "services" ? "الباقة" : "الفئة",
                    )}
                  </option>
                  {(section === "services"
                    ? [
                        { id: "basic", name: bi("Basic", "أساسية") },
                        { id: "full", name: bi("Full", "كاملة") },
                      ]
                    : categories.filter((x) =>
                        section === "houses"
                          ? x.id === "pet-houses"
                          : x.id !== "pet-houses",
                      )
                  ).map((x) => (
                    <option key={x.id} value={x.id}>
                      {c.local(x.name)}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={c.text("Catalogue pet type", "نوع حيوان الكتالوج")}
                  value={pet}
                  onChange={(e) => setPet(e.target.value)}
                >
                  <option value="">{c.text("Pet Type", "نوع الحيوان")}</option>
                  {(section === "services"
                    ? petCategories
                    : cataloguePetTypes
                  ).map((x) => (
                    <option key={x.id} value={x.id}>
                      {c.local(x.name)}
                    </option>
                  ))}
                </select>
                {section !== "services" && (
                  <select
                    aria-label={c.text("Catalogue stock", "مخزون الكتالوج")}
                    value={stock}
                    onChange={(e) => setStock(e.target.value)}
                  >
                    <option value="">{c.text("Stock", "المخزون")}</option>
                    <option value="in">{c.text("In Stock", "متوفر")}</option>
                    <option value="low">{c.text("Low Stock", "منخفض")}</option>
                    <option value="out">{c.text("Out of Stock", "نفد")}</option>
                  </select>
                )}
                {section === "houses" && (
                  <select
                    aria-label={c.text("Online orders", "الطلب عبر الموقع")}
                    value={readiness}
                    onChange={(e) => setReadiness(e.target.value)}
                  >
                    <option value="">{c.text("Online orders", "الطلب عبر الموقع")}</option>
                    <option value="ready">{c.text("Ready to order online", "جاهز للطلب عبر الموقع")}</option>
                    <option value="not-ready">{c.text("Not ready", "غير جاهز")}</option>
                  </select>
                )}
                <select
                  aria-label={c.text("Catalogue status", "حالة الكتالوج")}
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="">{c.text("Status", "الحالة")}</option>
                  <option value="active">{c.text("Active", "نشط")}</option>
                  <option value="inactive">
                    {c.text("Inactive", "غير نشط")}
                  </option>
                </select>
                <button
                  type="button"
                  className="admin-catalogue-filter-button"
                  aria-expanded={more}
                  onClick={() => setMore(!more)}
                >
                  <Filter size={16} />
                  {c.text("More Filters", "فلاتر إضافية")}
                </button>
              </div>
              {more && (
                <div className="admin-catalogue-extra">
                  {section !== "services" && (
                    <Field label={c.text("Brand", "العلامة التجارية")}>
                      <input
                        value={brand}
                        onChange={(e) => setBrand(e.target.value)}
                      />
                    </Field>
                  )}
                  <Field label={c.text("Minimum price · QAR", "أقل سعر · ر.ق")}>
                    <NumberInput
                      kind="decimal"
                      min={0}
                      value={minPrice}
                      onChange={(e) => setMinPrice(e.target.value)}
                    />
                  </Field>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      setCategory("");
                      setPet("");
                      setStock("");
                      setReadiness("");
                      setStatus("");
                      setBrand("");
                      setMinPrice("");
                      workspace.setSearch("");
                    }}
                  >
                    {c.text("Clear filters", "مسح الفلاتر")}
                  </button>
                </div>
              )}
              {checked.length > 0 && (
                <p className="admin-catalogue-selection">
                  {checked.length} {c.text("selected", "محدد")}{" "}
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setChecked([])}
                  >
                    {c.text("Clear selection", "مسح التحديد")}
                  </button>
                </p>
              )}
              {section !== "services" && catalog.status !== "ready" && (
                <CatalogState status={catalog.status} retry={catalog.retry} />
              )}
              <div className="admin-catalogue-table-scroll">
                <table className="admin-catalogue-table">
                  <thead>
                    <tr>
                      <th>
                        <input
                          type="checkbox"
                          aria-label={c.text(
                            "Select visible catalogue records",
                            "حدد سجلات الكتالوج المعروضة",
                          )}
                          checked={
                            visible.length > 0 &&
                            visible.every((r) => checked.includes(r.id))
                          }
                          onChange={(e) =>
                            setChecked(
                              e.target.checked
                                ? [
                                    ...new Set([
                                      ...checked,
                                      ...visible.map((r) => r.id),
                                    ]),
                                  ]
                                : checked.filter(
                                    (id) => !visible.some((r) => r.id === id),
                                  ),
                            )
                          }
                        />
                      </th>
                      {[
                        [
                          "name",
                          c.text(
                            section === "services" ? "Service" : "Product",
                            section === "services" ? "الخدمة" : "المنتج",
                          ),
                        ],
                        [
                          "id",
                          c.text(
                            section === "services" ? "Package ID" : "Product ID",
                            section === "services" ? "رمز الباقة" : "رمز المنتج",
                          ),
                        ],
                        ["category", c.text("Category", "الفئة")],
                        ["pet", c.text("Pet Type", "نوع الحيوان")],
                        [
                          "variants",
                          c.text(
                            section === "services" ? "Price" : "Variants",
                            section === "services" ? "السعر" : "الخيارات",
                          ),
                        ],
                        [
                          "stock",
                          c.text(
                            section === "services" ? "Duration" : "Total Stock",
                            section === "services" ? "المدة" : "المخزون",
                          ),
                        ],
                        ["status", c.text("Status", "الحالة")],
                      ].map(([id, label]) => (
                        <th
                          key={id}
                          aria-sort={
                            sort.key === id
                              ? sort.desc
                                ? "descending"
                                : "ascending"
                              : "none"
                          }
                        >
                          <button type="button" onClick={() => sortBy(id)}>
                            {label}
                            <ArrowDownUp size={11} />
                          </button>
                        </th>
                      ))}
                      <th>
                        <span className="sr-only">
                          {c.text("Actions", "الإجراءات")}
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((r) => {
                      const p = "variants" in r ? r : null,
                        total = p?.variants.reduce((n, v) => n + v.stock, 0) ?? 0,
                        cat = p
                          ? categories.find((x) => x.id === p.category)
                          : null,
                        petLabel = p
                          ? cataloguePetTypes.find((x) => x.id === p.pet)
                          : petCategories.find(
                              (x) =>
                                x.id ===
                                ("petCategory" in r ? r.petCategory : ""),
                            );
                      function open(event: React.MouseEvent<HTMLButtonElement>) {
                        detailTrigger.current = event.currentTarget;
                        setSelected(selected === r.id ? "" : r.id);
                      }
                      return (
                        <tr key={r.id} data-selected={selected === r.id}>
                          <td>
                            <input
                              type="checkbox"
                              aria-label={c.text(
                                `Select ${c.local(r.name)}`,
                                `تحديد ${c.local(r.name)}`,
                              )}
                              checked={checked.includes(r.id)}
                              onChange={(e) =>
                                setChecked(
                                  e.target.checked
                                    ? [...checked, r.id]
                                    : checked.filter((id) => id !== r.id),
                                )
                              }
                            />
                          </td>
                          <td>
                            <button
                              type="button"
                              className="admin-catalogue-product"
                              onClick={open}
                              aria-expanded={selected === r.id}
                            >
                              <Photo
                                src={r.image}
                                alt=""
                                className="admin-catalogue-thumb"
                              />
                              <span>
                                <strong>
                                  {c.local(r.name)}
                                  {p?.isSample && (
                                    <span className="sample-badge" title={c.text("Imported prototype content: review and replace it, then save.", "محتوى تجريبي مستورد: راجعه واستبدله ثم احفظ.")}>
                                      {c.text("Sample", "تجريبي")}
                                    </span>
                                  )}
                                </strong>
                                <small>
                                  {p?.brand ||
                                    c.text(
                                      p?.house
                                        ? "Pet House"
                                        : p
                                          ? "Nennus Catio"
                                          : "Grooming",
                                      p?.house
                                        ? "بيت للحيوان"
                                        : p
                                          ? "Nennus Catio"
                                          : "العناية",
                                    )}
                                </small>
                                {p?.house && <HouseReadyMark product={p} categoryShown={housesShown} />}
                              </span>
                            </button>
                          </td>
                          <td>
                            <bdi>{r.id}</bdi>
                          </td>
                          <td>
                            {cat
                              ? c.local(cat.name)
                              : c.text("Grooming", "العناية")}
                          </td>
                          <td>{petLabel ? c.local(petLabel.name) : "—"}</td>
                          <td>
                            {p
                              ? p.variants.length
                              : "price" in r
                                ? c.money(r.price)
                                : "—"}
                          </td>
                          <td>
                            {p ? (
                              p.house?.availability === "unconfirmed" ? (
                                c.text("Unconfirmed", "غير مؤكد")
                              ) : p.house?.availability === "made-to-order" ? (
                                c.text("Made to order", "يُصنع عند الطلب")
                              ) : stockState(p.variants) === "in" ? (
                                <span className="admin-catalogue-stock-good">
                                  {total}
                                </span>
                              ) : (
                                <span className="admin-catalogue-stock-number">
                                  {total}{" "}
                                  <StockBadge state={stockState(p.variants)} />
                                </span>
                              )
                            ) : "duration" in r ? (
                              `${r.duration} ${c.text("min", "دقيقة")}`
                            ) : (
                              "—"
                            )}
                          </td>
                          <td>
                            <CatalogueStatus active={r.active} />
                          </td>
                          <td>
                            <button
                              type="button"
                              className="icon-button"
                              aria-label={c.text(
                                `Details for ${c.local(r.name)}`,
                                `تفاصيل ${c.local(r.name)}`,
                              )}
                              aria-expanded={selected === r.id}
                              onClick={open}
                            >
                              <MoreHorizontal size={17} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {!rows.length && (
                <Empty>
                  {c.text(
                    "No matching catalogue records. Try clearing the filters.",
                    "لا توجد سجلات مطابقة. حاول مسح الفلاتر.",
                  )}
                </Empty>
              )}
              <footer className="admin-catalogue-pagination">
                <div>
                  <button
                    type="button"
                    aria-label={c.text(
                      "Previous catalogue page",
                      "صفحة الكتالوج السابقة",
                    )}
                    disabled={page <= 1}
                    onClick={() => setPage(page - 1)}
                  >
                    <ChevronLeft size={17} />
                  </button>
                  {Array.from({ length: pages }, (_, i) => i + 1)
                    .filter(
                      (n) => Math.abs(n - page) <= 2 || n === 1 || n === pages,
                    )
                    .map((n) => (
                      <button
                        type="button"
                        key={n}
                        aria-current={n === page ? "page" : undefined}
                        onClick={() => setPage(n)}
                      >
                        {n}
                      </button>
                    ))}
                  <button
                    type="button"
                    aria-label={c.text(
                      "Next catalogue page",
                      "صفحة الكتالوج التالية",
                    )}
                    disabled={page >= pages}
                    onClick={() => setPage(page + 1)}
                  >
                    <ChevronRight size={17} />
                  </button>
                </div>
                <span>
                  {c.text(
                    `Showing ${rows.length ? (page - 1) * size + 1 : 0}–${Math.min(page * size, rows.length)} of ${rows.length} ${section === "houses" ? "pet houses" : section}`,
                    `عرض ${rows.length ? (page - 1) * size + 1 : 0}–${Math.min(page * size, rows.length)} من ${rows.length}`,
                  )}
                </span>
                <select
                  aria-label={c.text(
                    "Catalogue rows per page",
                    "عدد سجلات الكتالوج في الصفحة",
                  )}
                  value={size}
                  onChange={(e) => setSize(Number(e.target.value))}
                >
                  {[10, 20, 50].map((n) => (
                    <option key={n} value={n}>
                      {c.text(`${n} per page`, `${n} لكل صفحة`)}
                    </option>
                  ))}
                </select>
              </footer>
            </section>
          )}
        </div>
        {record && (
          <CatalogueDetail
            key={record.id}
            record={record}
            date={date}
            onClose={closeDetails}
            onEdit={() => setEditing(record)}
          />
        )}
      </div>
      {editor &&
        ("variants" in editor ? (
          <ProductEditor
            key={`${editor.id}-${addingPack?.id ?? ""}`}
            initial={editor}
            addPack={addingPack ?? undefined}
            onClose={() => {
              setEditing(null);
              setAddingPack(null);
              workspace.setCreate(null);
            }}
          />
        ) : (
          <PackageEditor
            key={editor.id}
            initial={editor}
            onClose={() => setEditing(null)}
          />
        ))}
      <Modal
        open={workspace.create === "services" && catalog.source !== "api"}
        onOpenChange={(open) => {
          if (!open) workspace.setCreate(null);
        }}
        title={c.text("Configure Grooming Package", "إعداد باقة عناية")}
        description={c.text(
          "Choose an approved combination to configure. The eight combinations already exist; extra categories are not enabled.",
          "اختر تركيبة معتمدة لإعدادها. التركيبات الثمانية موجودة؛ الفئات الإضافية غير مفعلة.",
        )}
      >
        <div className="form-stack">
          <Field
            label={c.text("Pet category and package", "فئة الحيوان والباقة")}
          >
            <select
              value={packageId || data.packages[0]?.id}
              onChange={(e) => setPackageId(e.target.value)}
            >
              {data.packages.map((p) => (
                <option key={p.id} value={p.id}>
                  {c.local(p.name)}
                </option>
              ))}
            </select>
          </Field>
          <button
            type="button"
            className="button button--primary"
            onClick={() => {
              setEditing(
                data.packages.find(
                  (p) => p.id === (packageId || data.packages[0]?.id),
                ) ?? null,
              );
              workspace.setCreate(null);
            }}
          >
            {c.text("Open package editor", "فتح محرر الباقة")}
          </button>
        </div>
      </Modal>
      {managingCategories && <CategoriesManager onClose={() => setManagingCategories(false)} />}
    </AdminPage>
  );
}

/** "Ready to order online" or "Not ready: … missing" under a Pet House model's name (#14, D268). */
function HouseReadyMark({ product, categoryShown }: { product: Product; categoryShown: boolean }) {
  const c = useCopy(),
    readiness = houseReadiness(product, categoryShown);
  return <small className={`house-ready-mark${readiness.ready ? " is-ready" : ""}`}>{readinessLabel(readiness, c.text)}</small>;
}
