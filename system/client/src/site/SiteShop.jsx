import React, { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, ChevronUp, House, Search, ShoppingBag } from "lucide-react";
import { matchesCategory, matchesPet, money, pickName, productImage, productPrice, useCatalog, useCopy, useShopMeta } from "./copy.js";
import { petGroups } from "./pets.js";

export function SiteShop() {
  const { locale, text } = useCopy();
  const { products, status } = useCatalog();
  const { meta } = useShopMeta();
  const [params, setParams] = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const categories = meta?.categories || [];
  const pets = petGroups(meta?.petTypes);
  const pet = params.get("pet") || "";
  const category = params.get("category") || "";
  const search = params.get("search") || "";
  const sort = params.get("sort") || "featured";
  const maxPrice = params.has("max") ? Math.min(4000, Math.max(0, Number(params.get("max")) || 0)) : 4000;
  const page = Math.max(1, Number(params.get("page")) || 1);

  function setFilter(key, value) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setParams(next, { replace: true });
  }

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    let rows = products.filter((product) => {
      if (!matchesPet(product, pet)) return false;
      if (!matchesCategory(product, category, categories)) return false;
      if (maxPrice < 4000 && productPrice(product) > maxPrice) return false;
      if (!query) return true;
      const blob = `${product.name || ""} ${product.nameEn || ""}`.toLowerCase();
      return blob.includes(query);
    });
    if (sort === "price") rows = [...rows].sort((a, b) => productPrice(a) - productPrice(b));
    return rows;
  }, [products, pet, category, categories, search, sort, maxPrice]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / 12));
  const current = Math.min(page, pageCount);
  const visible = filtered.slice((current - 1) * 12, current * 12);
  const selectedPet = pets.find((row) => row.id === pet);
  const selectedCategory = categories.find((row) => row.id === category);

  return (
    <div className="ref-shop customer-page">
      <h1 className="sr-only">{text("Shop", "المتجر")}</h1>
      <section className="ref-pet-row ref-pet-row--shop" aria-label={text("Shop by pet", "تسوق حسب الحيوان")}>
        {pets.map((group) => (
          <button
            type="button"
            className={`ref-pet-circle ${pet === group.id ? "is-selected" : ""}`}
            key={group.id}
            aria-pressed={pet === group.id}
            onClick={() => setFilter("pet", pet === group.id ? "" : group.id)}
          >
            <span className="ref-pet-circle__image"><img src={group.image} alt="" /></span>
            <strong>{text(group.en, group.ar)}</strong>
          </button>
        ))}
      </section>

      <div className="ref-shop__toolbar">
        <fieldset className="ref-shop__categories">
          <legend className="sr-only">{text("Product category", "فئة المنتج")}</legend>
          <button type="button" className={!category ? "is-active" : ""} onClick={() => setFilter("category", "")}>{text("All Products", "كل المنتجات")}</button>
          {categories.map((entry) => (
            <button type="button" key={entry.id} className={category === entry.id ? "is-active" : ""} onClick={() => setFilter("category", entry.id)}>
              {pickName(entry, locale)}
            </button>
          ))}
        </fieldset>
        <label className="ref-shop__search">
          <Search size={18} aria-hidden="true" />
          <span className="sr-only">{text("Search products", "ابحث عن المنتجات")}</span>
          <input value={search} onChange={(event) => setFilter("search", event.target.value)} placeholder={text("Search products…", "ابحث عن المنتجات…")} />
        </label>
        <label className="ref-shop__sort">
          <span className="sr-only">{text("Sort products", "ترتيب المنتجات")}</span>
          <select aria-label={text("Sort products", "ترتيب المنتجات")} value={sort} onChange={(event) => setFilter("sort", event.target.value)}>
            <option value="featured">{text("Sort: Featured", "الترتيب: المميز")}</option>
            <option value="price">{text("Sort: Price: low to high", "الترتيب: السعر من الأقل")}</option>
          </select>
        </label>
      </div>

      <div className="ref-shop__summary">
        <span role="status">{status === "ready" ? `${filtered.length} ${text("results", "نتيجة")}` : ""}</span>
        <span>
          {selectedPet ? text(selectedPet.en, selectedPet.ar) : text("All pets", "كل الحيوانات")}
          {selectedCategory ? ` · ${pickName(selectedCategory, locale)}` : ""}
        </span>
      </div>

      <div className="ref-shop__content">
        <aside className={`ref-shop__sidebar ${filtersOpen ? "is-open" : ""}`} aria-label={text("Shop filters", "عوامل التصفية")}>
          <button type="button" className="ref-shop__filter-toggle" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((open) => !open)}>
            {text("Filter products", "تصفية المنتجات")}
            <span aria-hidden="true">{filtersOpen ? "−" : "+"}</span>
          </button>
          <h2>{text("Filter products", "تصفية المنتجات")}</h2>
          <div className="ref-shop__filter-block">
            <label htmlFor="ref-price-range">{text("Maximum price", "الحد الأعلى للسعر")}</label>
            <div className="ref-shop__range-labels"><span>0 QAR</span><span>{maxPrice} QAR</span></div>
            <input id="ref-price-range" type="range" min="0" max="4000" step="50" value={maxPrice} onChange={(event) => setFilter("max", event.target.value === "4000" ? "" : event.target.value)} />
          </div>
          <details className="ref-shop__filter-block ref-shop__brand-filter" open>
            <summary>{text("Brand", "العلامة التجارية")}<ChevronUp size={16} aria-hidden="true" /></summary>
            <p className="ref-shop__brand-empty">{text("No brands for these filters.", "لا توجد علامات تجارية لهذه الخيارات.")}</p>
          </details>
          <div className="ref-shop__filter-block">
            <h3>{text("Product type", "نوع المنتج")}</h3>
            {categories.map((entry) => (
              <button type="button" className="ref-shop__sidebar-option" key={entry.id} aria-pressed={category === entry.id} onClick={() => setFilter("category", category === entry.id ? "" : entry.id)}>
                <span className="ref-shop__checkbox" aria-hidden="true" />
                {pickName(entry, locale)}
              </button>
            ))}
          </div>
          <div className="ref-shop__house-note">
            <House size={21} aria-hidden="true" />
            <p>{text("Every pet type includes house designs. Browse the full house collection too.", "لكل نوع من الحيوانات تصاميم بيوت. يمكنك أيضاً تصفح مجموعة البيوت كاملة.")}</p>
            <Link to="/pet-houses" className="ref-inline-link">
              {text("Pet Houses page", "صفحة بيوت الحيوانات")}
              <ArrowRight size={15} className="directional" />
            </Link>
          </div>
        </aside>

        <section className="ref-shop__results" aria-label={text("Shop results", "نتائج المتجر")}>
          {status === "loading" && <p className="ref-loading" role="status">{text("Loading", "جارٍ التحميل")}</p>}
          {status === "error" && <p role="alert">{text("The shop could not be loaded.", "تعذّر تحميل المتجر.")}</p>}
          {status === "ready" && visible.length > 0 && (
            <div className="ref-shop__grid">
              {visible.map((product) => {
                const image = productImage(product);
                const variant = product.variants?.[0];
                return (
                  <Link className="ref-shop-card" to={`/shop/product/${product.id}`} key={product.id}>
                    <div className="ref-shop-card__image">
                      {image ? <img src={image} alt={pickName(product, locale)} /> : <span className="photo-unavailable" />}
                    </div>
                    <div className="ref-shop-card__body">
                      <small>{product.isPetHouse ? text("Pet House", "بيت للحيوان") : pickName(product.category, locale) || text("Pets", "حيوانات")}</small>
                      <h2>{pickName(product, locale)}</h2>
                      <p>{product.isPetHouse ? text("Ready-model design", "تصميم جاهز") : (variant ? (locale === "en" ? variant.labelEn || variant.label : variant.label || variant.labelEn) : "")}</p>
                      <div className="ref-shop-card__bottom">
                        <strong>{money(productPrice(product))}</strong>
                        {product.isPetHouse ? <House size={19} aria-hidden="true" /> : <ShoppingBag size={19} aria-hidden="true" />}
                      </div>
                      <span className="ref-shop-card__action">
                        {product.isPetHouse ? text("View house details", "عرض تفاصيل البيت") : text("Choose options", "اختر الخيارات")}
                        <ArrowRight size={14} className="directional" />
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
          {status === "ready" && !filtered.length && (
            <p>
              {text("No matching products. Try another filter.", "لا توجد منتجات مطابقة. جرّب خياراً آخر.")}{" "}
              <Link to="/shop" className="ref-inline-link">{text("Clear filters", "مسح الخيارات")}</Link>
            </p>
          )}
          {pageCount > 1 && (
            <nav className="ref-pagination" aria-label={text("Shop pages", "صفحات المتجر")}>
              <button type="button" disabled={current <= 1} onClick={() => setFilter("page", String(current - 1))}>{text("Previous", "السابق")}</button>
              <span>{current} / {pageCount}</span>
              <button type="button" disabled={current >= pageCount} onClick={() => setFilter("page", String(current + 1))}>{text("Next", "التالي")}</button>
            </nav>
          )}
        </section>
      </div>
    </div>
  );
}
