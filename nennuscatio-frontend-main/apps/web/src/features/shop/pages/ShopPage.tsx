"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Search, ArrowRight } from "lucide-react";
import { useBusiness } from "@/mocks/MockDataProvider";
import {
  shopCategories as categories,
  shopPetTypes as petTypes,
} from "@/mocks/data/business";
import { selectShopProducts } from "../lib/catalogue";
import { useCopy } from "@/shared/lib/copy";
import { Link, useRouter } from "@/i18n/navigation";
import { Photo } from "@/shared/ui/Photo";
import { Notice, Empty } from "@/shared/ui/BusinessUI";
export function ShopPage() {
  return (
    <Suspense fallback={<p>…</p>}>
      <Catalogue />
    </Suspense>
  );
}
function Catalogue() {
  const c = useCopy(),
    data = useBusiness(),
    q = useSearchParams(),
    router = useRouter();
  const category = q.get("category") ?? "",
    pet = q.get("pet") ?? "",
    search = q.get("search") ?? "",
    sort = q.get("sort") ?? "featured";
  function filter(key: string, value: string) {
    const next = new URLSearchParams(q.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`/shop?${next.toString()}`);
  }
  const products = selectShopProducts(data.products, {
    category,
    pet,
    search,
    sort,
    locale: c.locale,
  });
  return (
    <div className="customer-page">
      <header className="customer-heading">
        <p className="eyebrow">
          {c.text("EVERYDAY ESSENTIALS", "المستلزمات اليومية")}
        </p>
        <h1>
          {c.text("A little something for every pet.", "شيء لطيف لكل حيوان.")}
        </h1>
        <p>
          {c.text(
            "Choose a category, then your pet. Find just what they need.",
            "اختر الفئة ثم نوع الحيوان، واعثر على ما يحتاجه.",
          )}
        </p>
      </header>
      <div className="shop-filters">
        <div>
          <span className="step-label">1. {c.text("Category", "الفئة")}</span>
          <div className="chips">
            <button
              type="button"
              className={!category ? "selected" : ""}
              onClick={() => filter("category", "")}
            >
              {c.text("All", "الكل")}
            </button>
            {categories.map((x) => (
              <button
                type="button"
                key={x.id}
                className={category === x.id ? "selected" : ""}
                onClick={() => filter("category", x.id)}
              >
                {c.local(x.name)}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="step-label">
            2. {c.text("Pet type", "نوع الحيوان")}
          </span>
          <div className="chips">
            <button
              type="button"
              className={!pet ? "selected" : ""}
              onClick={() => filter("pet", "")}
            >
              {c.text("All", "الكل")}
            </button>
            {petTypes.map((x) => (
              <button
                type="button"
                key={x.id}
                className={pet === x.id ? "selected" : ""}
                onClick={() => filter("pet", x.id)}
              >
                {c.local(x.name)}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="row spread catalogue-toolbar">
        <label className="search-field">
          <Search size={18} />
          <input
            aria-label={c.text("Search products", "ابحث عن المنتجات")}
            placeholder={c.text("Search products…", "ابحث عن المنتجات…")}
            value={search}
            onChange={(e) => filter("search", e.target.value)}
          />
        </label>
        <label className="row">
          {c.text("Sort", "ترتيب")}
          <select value={sort} onChange={(e) => filter("sort", e.target.value)}>
            <option value="featured">{c.text("Featured", "المميز")}</option>
            <option value="price">
              {c.text("Price: low to high", "السعر: من الأقل")}
            </option>
          </select>
        </label>
        <span className="muted small">
          {products.length} {c.text("products", "منتجات")}
        </span>
      </div>
      {products.length ? (
        <div className="product-grid">
          {products.map((p) => (
            <Link className="product-card" href={`/shop/${p.id}`} key={p.id}>
              <Photo src={p.image} alt={c.local(p.name)} />
              <div>
                <span className="eyebrow">
                  {c.local(petTypes.find((x) => x.id === p.pet)!.name)}
                </span>
                <h2>{c.local(p.name)}</h2>
                <p>{c.local(p.variants[0].label)}</p>
                <div className="row spread">
                  <strong>
                    {c.money(Math.min(...p.variants.map((v) => v.price)))}
                  </strong>
                  <ArrowRight size={18} className="directional" />
                </div>
                <small
                  className={
                    p.variants.some((v) => v.stock > 0) ? "muted" : "sold-out"
                  }
                >
                  {c.text(
                    p.variants.some((v) => v.stock > 0)
                      ? "Choose options"
                      : "Out of stock",
                    p.variants.some((v) => v.stock > 0)
                      ? "اختر الخيارات"
                      : "غير متوفر",
                  )}
                </small>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <Empty>
          {c.text(
            "No matching products. Try another category or pet type.",
            "لا توجد منتجات مطابقة. جرّب فئة أو نوعاً آخر.",
          )}
          <Link href="/shop" className="text-link">
            {c.text("Clear filters", "مسح عوامل التصفية")}
          </Link>
        </Empty>
      )}
      <Notice />
    </div>
  );
}
