"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search, ArrowRight, Pencil } from "lucide-react";
import { houseCollections } from "@/mocks/data/pet-houses";
import { useCatalog } from "@/shared/api/catalog";
import { CatalogState } from "@/shared/ui/CatalogState";
import { publicPetTypes, matchesPublicPet } from "@/mocks/data/public-pets";
import { assets } from "@/mocks/data/assets";
import { useCopy } from "@/shared/lib/copy";
import { Link, useRouter } from "@/i18n/navigation";
import { Photo } from "@/shared/ui/Photo";
import { Empty } from "@/shared/ui/BusinessUI";
import { HouseCard } from "../components/HouseCard";
import { CustomHouseBanner } from "../components/CustomHouseBanner";
import { houseModelCount } from "../lib/labels";
export function PetHousesPage() {
  return (
    <Suspense fallback={<p role="status">Loading / جارٍ التحميل…</p>}>
      <Catalogue />
    </Suspense>
  );
}
function Catalogue() {
  const c = useCopy(),
    catalog = useCatalog(),
    q = useSearchParams(),
    router = useRouter();
  const [search, setSearch] = useState("");
  const pet = q.get("pet") ?? "cats",
    collection = q.get("collection") ?? "";
  const houses = catalog.products.filter(
    (p) => p.active && p.category === "pet-houses" && p.house,
  );
  const availableCollections = houseCollections.filter((x) =>
    houses.some((p) => (!pet || matchesPublicPet(p, pet)) && p.house?.collection === x.id),
  );
  const filtered = houses.filter(
    (p) =>
      (!pet || matchesPublicPet(p, pet)) &&
      (!collection || p.house?.collection === collection) &&
      `${p.name.en} ${p.name.ar}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / 12));
  const page = Math.min(
    totalPages,
    Math.max(1, Math.floor(Number(q.get("page"))) || 1),
  );
  function filter(key: string, value: string) {
    const next = new URLSearchParams(q.toString());
    next.set(key, value);
    next.delete("page");
    if (key === "pet") next.delete("collection");
    router.replace(`/pet-houses?${next.toString()}`, { scroll: false });
    setSearch("");
  }
  function paginate(value: number) {
    const next = new URLSearchParams(q.toString());
    next.set("page", String(value));
    router.replace(`/pet-houses?${next.toString()}`, { scroll: false });
  }
  return (
    <div className="customer-page houses-page">
      <nav
        className="house-breadcrumb"
        aria-label={c.text("Breadcrumb", "مسار التنقل")}
      >
        <Link href="/">{c.text("Home", "الرئيسية")}</Link>
        <ArrowRight size={12} className="directional" />
        <span aria-current="page">
          {c.text("Pet Houses", "بيوت الحيوانات")}
        </span>
      </nav>
      <header className="ref-page-hero ref-page-hero--houses">
        <Photo src={assets.housesHero} alt={c.text("A cat resting in a wooden pet house", "قطة داخل بيت خشبي")} priority sizes="100vw" />
        <div>
          <p className="eyebrow">{c.text("PET HOUSES", "بيوت الحيوانات")}</p>
          <h1>{c.text("A little home. A whole lot of comfort.", "بيت صغير. راحة كبيرة.")}</h1>
          <p>{c.text("Explore ready-made designs for different pets, or ask about something made just for yours.", "استكشف تصاميم جاهزة لحيوانات مختلفة، أو اسأل عن تصميم خاص بحيوانك.")}</p>
          <div className="ref-page-hero__actions">
            <a href="#house-results" className="button button--primary ref-pill-button">
              {c.text("Shop ready models", "تصفح التصاميم الجاهزة")}
              <ArrowRight size={16} className="directional" />
            </a>
            <a href="#house-custom" className="button button--secondary ref-pill-button">
              <Pencil size={15} aria-hidden="true" />
              {c.text("Design a Custom House", "صمّم بيتاً مخصصاً")}
            </a>
          </div>
        </div>
      </header>
      <section
        aria-label={c.text("Choose a pet type", "اختر نوع الحيوان")}
        className="house-pet-grid ref-pet-row ref-pet-row--houses"
      >
        {publicPetTypes.map((x) => {
          return (
            <button
              type="button"
              key={x.id}
              className={`ref-pet-circle ${pet === x.id ? "is-selected" : ""}`}
              aria-pressed={pet === x.id}
              onClick={() => filter("pet", pet === x.id ? "" : x.id)}
            >
              <span className="ref-pet-circle__image"><Photo src={x.image} alt="" sizes="(max-width: 700px) 90px, 120px" /></span>
              <strong>{c.local(x.name)}</strong>
            </button>
          );
        })}
      </section>
      <section
        id="house-results"
        className="house-results"
        aria-label={c.text("House models", "تصاميم البيوت")}
      >
        <div className="house-results__heading">
          <div>
            <h2>
              {pet
                ? c.local(
                    publicPetTypes.find((x) => x.id === pet)?.name ?? {
                      en: "No matching pet type",
                      ar: "نوع غير متاح",
                    },
                  )
                : c.text("All pet houses", "جميع البيوت")}
            </h2>
            <p className="small muted" role="status">
              {catalog.status === "ready" && (
                <>
                  {houseModelCount(filtered.length, c.locale)} ·{" "}
                  {c.text("Reference catalogue", "كتالوج مرجعي")}
                </>
              )}
            </p>
          </div>
          <label className="search-field">
            <Search size={17} />
            <span className="sr-only">
              {c.text("Search house models", "ابحث عن تصاميم البيوت")}
            </span>
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                const next = new URLSearchParams(q.toString());
                next.delete("page");
                router.replace(`/pet-houses?${next.toString()}`, {
                  scroll: false,
                });
              }}
              placeholder={c.text("Search models…", "ابحث عن تصميم…")}
            />
          </label>
        </div>
        <div className="chips house-collection-filters">
          <button
            type="button"
            className={!pet ? "selected" : ""}
            aria-pressed={!pet}
            onClick={() => filter("pet", "")}
          >
            {c.text("All pets", "كل الحيوانات")}
          </button>
          <button
            type="button"
            className={!collection ? "selected" : ""}
            aria-pressed={!collection}
            onClick={() => filter("collection", "")}
          >
            {c.text("All designs", "كل التصاميم")}
          </button>
          {availableCollections.map((x) => (
            <button
              type="button"
              key={x.id}
              className={collection === x.id ? "selected" : ""}
              aria-pressed={collection === x.id}
              onClick={() => filter("collection", x.id)}
            >
              {c.local(x.name)}
            </button>
          ))}
        </div>
        <p className="house-preview-note">
          {c.text(
            "Prototype catalogue: prices and specifications are reference examples, not approved Nennus Catio offers. House ordering is paused until delivery charges and estimates are configured.",
            "كتالوج تجريبي: الأسعار والمواصفات أمثلة مرجعية وليست عروضاً معتمدة. طلب البيوت متوقف حتى إعداد رسوم ومدد التوصيل.",
          )}
        </p>
        {catalog.status !== "ready" ? (
          <CatalogState status={catalog.status} retry={catalog.retry} />
        ) : filtered.length ? (
          <div className="house-grid">
            {filtered.slice((page - 1) * 12, page * 12).map((p, i) => (
              <HouseCard key={p.id} product={p} priority={i < 4} />
            ))}
          </div>
        ) : (
          <Empty>
            {c.text(
              "No models match these filters.",
              "لا تصاميم تطابق هذه الخيارات.",
            )}
            <button
              className="button button--secondary"
              type="button"
              onClick={() => {
                setSearch("");
                router.replace("/pet-houses?pet=");
              }}
            >
              {c.text("Clear filters", "مسح الخيارات")}
            </button>
          </Empty>
        )}
        {filtered.length > 12 && (
          <nav
            className="house-pagination"
            aria-label={c.text("Catalogue pages", "صفحات الكتالوج")}
          >
            <button
              type="button"
              className="button button--secondary"
              disabled={page === 1}
              onClick={() => paginate(page - 1)}
            >
              {c.text("Previous", "السابق")}
            </button>
            <span>
              {c.text(
                `Page ${page} of ${totalPages}`,
                `صفحة ${new Intl.NumberFormat("ar-QA").format(page)} من ${new Intl.NumberFormat("ar-QA").format(totalPages)}`,
              )}
            </span>
            <button
              type="button"
              className="button button--secondary"
              disabled={page === totalPages}
              onClick={() => paginate(page + 1)}
            >
              {c.text("Next", "التالي")}
            </button>
          </nav>
        )}
      </section>
      <CustomHouseBanner />
    </div>
  );
}
