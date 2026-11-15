"use client";

import { Suspense, useState } from "react";
import { ArrowRight, ChevronUp, House, Search, ShoppingBag } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Link, useRouter } from "@/i18n/navigation";
import type { Product } from "@/mocks/data/business";
import { usePublicCategories } from "@/shared/api/admin-catalog";
import { useCatalog } from "@/shared/api/catalog";
import { CatalogState } from "@/shared/ui/CatalogState";
import { publicPetTypes, publicPetForProduct } from "@/mocks/data/public-pets";
import { useCopy } from "@/shared/lib/copy";
import { Empty } from "@/shared/ui/BusinessUI";
import { Photo } from "@/shared/ui/Photo";
import { OfferBadges, OfferPrice } from "../components/OfferPrice";
import { cheapestPack, normaliseBrand, selectShopProducts, shopBrandFacets, sortPrice } from "../lib/catalogue";

export function ReferenceShopPage() {
  return (
    <Suspense fallback={<p className="ref-loading" role="status">Loading / جارٍ التحميل…</p>}>
      <Catalogue />
    </Suspense>
  );
}

function Catalogue() {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [showAllBrands, setShowAllBrands] = useState(false);
  const c = useCopy();
  const catalog = useCatalog();
  // Real categories (6b): new ones appear and hidden ones disappear without a code change.
  const categories = usePublicCategories();
  const q = useSearchParams();
  const router = useRouter();
  const pet = q.get("pet") ?? "";
  const category = q.get("category") ?? "";
  const search = q.get("search") ?? "";
  const sort = q.get("sort") ?? "featured";
  const selectedBrands = [...new Set(q.getAll("brand").map(normaliseBrand).filter(Boolean))];
  const rawMax = Number(q.get("max"));
  const maxPrice = q.has("max") && Number.isFinite(rawMax)
    ? Math.min(4000, Math.max(0, rawMax))
    : 4000;
  const selectedPet = publicPetTypes.find((entry) => entry.id === pet);
  const selectedCategory = categories.find((entry) => entry.id === category);
  const baseProducts = selectShopProducts(catalog.products, {
    pet,
    category,
    search,
    sort,
    locale: c.locale,
  // The price after the offer (11e); a house priced on request has no price to compare.
  }).filter((product) => maxPrice === 4000 || sortPrice(product) <= maxPrice * 100);
  const brandNames = shopBrandFacets(catalog.products);
  const brandOptions = shopBrandFacets(baseProducts, selectedBrands.map((id) => brandNames.find((brand) => brand.id === id)?.name ?? id));
  const visibleBrands = showAllBrands ? brandOptions : brandOptions.filter((brand, index) => index < 5 || selectedBrands.includes(brand.id));
  const products = selectShopProducts(baseProducts, { brands: selectedBrands });
  const pageCount = Math.max(1, Math.ceil(products.length / 12));
  const requestedPage = Number(q.get("page"));
  const page = Number.isInteger(requestedPage)
    ? Math.min(pageCount, Math.max(1, requestedPage))
    : 1;

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(q.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    router.replace(`/shop?${next.toString()}`, { scroll: false });
  }

  function toggleBrand(brand: string) {
    const next = new URLSearchParams(q.toString());
    const brands = selectedBrands.includes(brand) ? selectedBrands.filter((id) => id !== brand) : [...selectedBrands, brand];
    next.delete("brand");
    for (const id of brands) next.append("brand", id);
    next.delete("page");
    router.replace(`/shop?${next.toString()}`, { scroll: false });
  }

  function renderProduct(product: Product, index: number) {
    const isHouse = !!product.house;
    const petLabel = selectedPet && pet
      ? c.local(selectedPet.name)
      : c.local(publicPetForProduct(product)?.name ?? { en: "Pets", ar: "حيوانات" });
    const href = isHouse ? `/pet-houses/${product.id}` : `/shop/${product.id}`;
    const pack = cheapestPack(product);
    return (
      <Link className="ref-shop-card" href={href} key={product.id}>
        <div className="ref-shop-card__image">
          <Photo
            src={product.image}
            alt={c.local(product.name)}
            priority={index < 4}
            sizes="(max-width: 650px) 48vw, (max-width: 1000px) 32vw, 22vw"
          />
          <OfferBadges offers={product.offers} className="offer-badges--card" />
        </div>
        <div className="ref-shop-card__body">
          <small>{petLabel}{isHouse ? ` · ${c.text("Pet House", "بيت للحيوان")}` : ""}</small>
          <h2>{c.local(product.name)}</h2>
          <p>{isHouse ? c.text("Ready-model design", "تصميم جاهز") : c.local(product.variants[0].label)}</p>
          <div className="ref-shop-card__bottom">
            {isHouse && product.house?.purchaseMode === "inquiry" ? (
              <strong>{c.text("Price on request", "السعر عند الاستفسار")}</strong>
            ) : (
              <OfferPrice price={pack.price} salePrice={pack.salePrice} />
            )}
            {isHouse ? <House size={19} aria-hidden="true" /> : <ShoppingBag size={19} aria-hidden="true" />}
          </div>
          <span className="ref-shop-card__action">
            {isHouse
              ? c.text("View house details", "عرض تفاصيل البيت")
              : c.text("Choose options", "اختر الخيارات")}
            <ArrowRight size={14} className="directional" />
          </span>
        </div>
      </Link>
    );
  }

  return (
    <div className="ref-shop customer-page">
      <section className="ref-pet-row ref-pet-row--shop" aria-label={c.text("Shop by pet", "تسوق حسب الحيوان")}>
        {publicPetTypes.map((group) => (
          <button
            type="button"
            className={`ref-pet-circle ${pet === group.id ? "is-selected" : ""}`}
            key={group.id}
            aria-pressed={pet === group.id}
            onClick={() => setFilter("pet", pet === group.id ? "" : group.id)}
          >
            <span className="ref-pet-circle__image">
              <Photo src={group.image} alt="" sizes="(max-width: 700px) 90px, 120px" />
            </span>
            <strong>{c.local(group.name)}</strong>
          </button>
        ))}
      </section>

      <div className="ref-shop__toolbar">
        <fieldset className="ref-shop__categories">
          <legend className="sr-only">{c.text("Product category", "فئة المنتج")}</legend>
          <button type="button" className={!category ? "is-active" : ""} onClick={() => setFilter("category", "")}>
            {c.text("All Products", "كل المنتجات")}
          </button>
          {categories.map((entry) => (
            <button
              type="button"
              key={entry.id}
              className={category === entry.id ? "is-active" : ""}
              onClick={() => setFilter("category", entry.id)}
            >
              {c.local(entry.name)}
            </button>
          ))}
        </fieldset>
        <label className="ref-shop__search">
          <Search size={18} aria-hidden="true" />
          <span className="sr-only">{c.text("Search products", "ابحث عن المنتجات")}</span>
          <input
            value={search}
            onChange={(event) => setFilter("search", event.target.value)}
            placeholder={c.text("Search products…", "ابحث عن المنتجات…")}
          />
        </label>
        <label className="ref-shop__sort">
          <span className="sr-only">{c.text("Sort products", "ترتيب المنتجات")}</span>
          <select aria-label={c.text("Sort products", "ترتيب المنتجات")} value={sort} onChange={(event) => setFilter("sort", event.target.value)}>
            <option value="featured">{c.text("Sort: Featured", "الترتيب: المميز")}</option>
            <option value="price">{c.text("Sort: Price: low to high", "الترتيب: السعر من الأقل")}</option>
          </select>
        </label>
      </div>

      <div className="ref-shop__summary">
        <span role="status">
          {catalog.status === "ready" ? `${products.length} ${c.text("results", "نتيجة")}` : ""}
        </span>
        <span>{selectedPet ? c.local(selectedPet.name) : c.text("All pets", "كل الحيوانات")}
          {selectedCategory ? ` · ${c.local(selectedCategory.name)}` : ""}
        </span>
      </div>

      <div className="ref-shop__content">
        <aside className={`ref-shop__sidebar ${filtersOpen ? "is-open" : ""}`} aria-label={c.text("Shop filters", "عوامل التصفية")}>
          <button
            type="button"
            className="ref-shop__filter-toggle"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((open) => !open)}
          >
            {c.text("Filter products", "تصفية المنتجات")}
            <span aria-hidden="true">{filtersOpen ? "−" : "+"}</span>
          </button>
          <h2>{c.text("Filter products", "تصفية المنتجات")}</h2>
          <div className="ref-shop__filter-block">
            <label htmlFor="ref-price-range">{c.text("Maximum price", "الحد الأعلى للسعر")}</label>
            <div className="ref-shop__range-labels"><span>0 QAR</span><span>{maxPrice} QAR</span></div>
            <input
              id="ref-price-range"
              type="range"
              min="0"
              max="4000"
              step="50"
              value={maxPrice}
              onChange={(event) => setFilter("max", event.target.value === "4000" ? "" : event.target.value)}
            />
          </div>
          <details className="ref-shop__filter-block ref-shop__brand-filter" open>
            <summary>{c.text("Brand", "العلامة التجارية")}<ChevronUp size={16} aria-hidden="true" /></summary>
            <div>
              {visibleBrands.map((brand) => (
                <label className="ref-shop__brand-option" key={brand.id}>
                  <input type="checkbox" checked={selectedBrands.includes(brand.id)} onChange={() => toggleBrand(brand.id)} />
                  <span>{brand.name}</span><small>{brand.count}</small>
                </label>
              ))}
              {!brandOptions.length && <p className="ref-shop__brand-empty">{c.text("No brands for these filters.", "لا توجد علامات تجارية لهذه الخيارات.")}</p>}
              {brandOptions.length > 5 && <button type="button" className="ref-shop__brand-more" onClick={() => setShowAllBrands((show) => !show)}>{showAllBrands ? c.text("Show less", "عرض أقل") : c.text("Show more", "عرض المزيد")}</button>}
            </div>
          </details>
          <div className="ref-shop__filter-block">
            <h3>{c.text("Product type", "نوع المنتج")}</h3>
            {categories.map((entry) => (
              <button
                type="button"
                className="ref-shop__sidebar-option"
                key={entry.id}
                aria-pressed={category === entry.id}
                onClick={() => setFilter("category", category === entry.id ? "" : entry.id)}
              >
                <span className="ref-shop__checkbox" aria-hidden="true" />
                {c.local(entry.name)}
              </button>
            ))}
          </div>
          <div className="ref-shop__house-note">
            <House size={21} aria-hidden="true" />
            <p>{c.text("Every pet type includes house designs. Browse the full house collection too.", "لكل نوع من الحيوانات تصاميم بيوت. يمكنك أيضاً تصفح مجموعة البيوت كاملة.")}</p>
            <Link href="/pet-houses" className="ref-inline-link">
              {c.text("Pet Houses page", "صفحة بيوت الحيوانات")}
              <ArrowRight size={15} className="directional" />
            </Link>
          </div>
        </aside>

        <section className="ref-shop__results" aria-label={c.text("Shop results", "نتائج المتجر")}>
          {catalog.status !== "ready" ? (
            <CatalogState status={catalog.status} retry={catalog.retry} />
          ) : products.length ? (
            <div className="ref-shop__grid">
              {products.slice((page - 1) * 12, page * 12).map(renderProduct)}
            </div>
          ) : (
            <Empty>
              {c.text("No matching products or houses. Try another filter.", "لا توجد منتجات أو بيوت مطابقة. جرّب خياراً آخر.")}
              <Link href="/shop" className="ref-inline-link">{c.text("Clear filters", "مسح الخيارات")}</Link>
            </Empty>
          )}
          {pageCount > 1 && (
            <nav className="ref-pagination" aria-label={c.text("Shop pages", "صفحات المتجر")}>
              <button type="button" disabled={page <= 1} onClick={() => setFilter("page", String(page - 1))}>
                {c.text("Previous", "السابق")}
              </button>
              <span>{page} / {pageCount}</span>
              <button type="button" disabled={page >= pageCount} onClick={() => setFilter("page", String(page + 1))}>
                {c.text("Next", "التالي")}
              </button>
            </nav>
          )}
        </section>
      </div>
      <p className="ref-catalogue-disclaimer">
        {c.text(
          "Design preview with sample products, demo brands and reference house models. House ordering awaits confirmed delivery charges and timing.",
          "معاينة تصميم بمنتجات وعلامات تجارية تجريبية وبيوت مرجعية. طلب البيوت ينتظر تأكيد رسوم ومواعيد التوصيل.",
        )}
      </p>
    </div>
  );
}
