import React, { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, Pencil, Search } from "lucide-react";
import { matchesPet, money, pickName, productImage, productPrice, useCatalog, useCopy, useShopMeta, waLink } from "./copy.js";
import { PETS } from "./pets.js";

export function SiteHouses() {
  const { locale, text } = useCopy();
  const { products, status } = useCatalog("?houses=1");
  const { business } = useShopMeta();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const pet = params.get("pet") || "";
  const houses = products.filter((product) => product.isPetHouse);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return houses.filter((product) => {
      if (!matchesPet(product, pet)) return false;
      if (!query) return true;
      return `${product.name || ""} ${product.nameEn || ""}`.toLowerCase().includes(query);
    });
  }, [houses, pet, search]);
  const custom = waLink(
    business?.whatsapp,
    text("Hi Nennus Catio, I'd like to discuss a custom pet house.", "مرحباً Nennus Catio، أود مناقشة تصميم بيت مخصص لحيواني الأليف."),
  );

  function filter(value) {
    const next = new URLSearchParams(params);
    if (value) next.set("pet", value);
    else next.delete("pet");
    setParams(next, { replace: true });
  }

  return (
    <div className="customer-page houses-page">
      <nav className="house-breadcrumb" aria-label={text("Breadcrumb", "مسار التنقل")}>
        <Link to="/">{text("Home", "الرئيسية")}</Link>
        <ArrowRight size={12} className="directional" />
        <span aria-current="page">{text("Pet Houses", "بيوت الحيوانات")}</span>
      </nav>
      <header className="ref-page-hero ref-page-hero--houses">
        <img src="/images/reference-refresh/pet-houses-hero.png" alt={text("A cat resting in a wooden pet house", "قطة داخل بيت خشبي")} />
        <div>
          <p className="eyebrow">{text("PET HOUSES", "بيوت الحيوانات")}</p>
          <h1>{text("A little home. A whole lot of comfort.", "بيت صغير. راحة كبيرة.")}</h1>
          <p>{text("Explore ready-made designs for different pets, or ask about something made just for yours.", "استكشف تصاميم جاهزة لحيوانات مختلفة، أو اسأل عن تصميم خاص بحيوانك.")}</p>
          <div className="ref-page-hero__actions">
            <a href="#house-results" className="button button--primary ref-pill-button">
              {text("Shop ready models", "تصفح التصاميم الجاهزة")}
              <ArrowRight size={16} className="directional" />
            </a>
            <a href="#house-custom" className="button button--secondary ref-pill-button">
              <Pencil size={15} aria-hidden="true" />
              {text("Design a Custom House", "صمّم بيتاً مخصصاً")}
            </a>
          </div>
        </div>
      </header>
      <section aria-label={text("Choose a pet type", "اختر نوع الحيوان")} className="house-pet-grid ref-pet-row ref-pet-row--houses">
        {PETS.map((group) => (
          <button type="button" key={group.id} className={`ref-pet-circle ${pet === group.id ? "is-selected" : ""}`} aria-pressed={pet === group.id} onClick={() => filter(pet === group.id ? "" : group.id)}>
            <span className="ref-pet-circle__image"><img src={group.image} alt="" /></span>
            <strong>{text(group.en, group.ar)}</strong>
          </button>
        ))}
      </section>
      <section id="house-results" className="house-results" aria-label={text("House models", "تصاميم البيوت")}>
        <div className="house-results__heading">
          <div>
            <h2>{pet ? text(PETS.find((row) => row.id === pet)?.en || "Pet houses", PETS.find((row) => row.id === pet)?.ar || "بيوت الحيوانات") : text("All pet houses", "جميع البيوت")}</h2>
            <p className="small muted" role="status">{status === "ready" ? `${filtered.length} ${text("models", "تصميم")}` : ""}</p>
          </div>
          <label className="search-field">
            <Search size={17} />
            <span className="sr-only">{text("Search house models", "ابحث عن تصاميم البيوت")}</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={text("Search models…", "ابحث عن تصميم…")} />
          </label>
        </div>
        <div className="chips house-collection-filters">
          <button type="button" className={!pet ? "selected" : ""} aria-pressed={!pet} onClick={() => filter("")}>{text("All pets", "كل الحيوانات")}</button>
        </div>
        {status === "ready" && filtered.length > 0 && (
          <div className="house-grid">
            {filtered.map((product) => {
              const image = productImage(product);
              return (
                <Link to={`/shop/product/${product.id}`} className="house-card" key={product.id}>
                  {image ? <img src={image} alt={pickName(product, locale)} /> : <span className="photo-unavailable" />}
                  <div className="house-card__body">
                    <p className="eyebrow">{pickName(product.category, locale) || text("Ready model", "تصميم جاهز")}</p>
                    <h2>{pickName(product, locale)}</h2>
                    <div className="row spread">
                      <strong>{money(productPrice(product))}</strong>
                      <ArrowRight size={18} className="directional" />
                    </div>
                    {product.leadTimeDays ? <p className="small muted">{text(`Ready in about ${product.leadTimeDays} days`, `جاهز خلال ${product.leadTimeDays} يوماً تقريباً`)}</p> : null}
                    <span className="house-card__action">{text("Order online", "اطلب عبر الموقع")}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
        {status === "ready" && !filtered.length && <p>{text("House models will appear here as they are added.", "ستظهر تصاميم البيوت هنا بعد إضافتها.")}</p>}
      </section>
      <section className="ref-custom-house-banner" id="house-custom" aria-labelledby="house-custom-title">
        <img src="/images/reference-refresh/custom-house-banner.png" alt={text("A cat relaxing in a woven pet house", "قطة تستريح داخل بيت من الخوص")} />
        <div className="ref-custom-house-banner__copy">
          <p className="eyebrow">{text("CUSTOM PET HOUSES", "بيوت مخصصة للحيوانات الأليفة")}</p>
          <h2 id="house-custom-title">{text("Their own space, your own idea.", "مساحة تخصّهم، وفكرة من إبداعك.")}</h2>
          <p className="ref-custom-house-banner__description">{text("From ready-made houses to custom designs, create a space that feels like home.", "من البيوت الجاهزة إلى التصاميم المخصصة، اصنع لهم مساحة تشعرهم بالراحة وكأنهم في بيتهم.")}</p>
          <div className="ref-custom-house-banner__actions">
            {custom ? (
              <a href={custom} target="_blank" rel="noopener noreferrer" className="button button--primary ref-pill-button">
                {text("Design a Custom House", "صمّم بيتاً مخصصاً")}<ArrowRight size={15} className="directional" />
              </a>
            ) : (
              <Link to="/contact" className="button button--primary ref-pill-button">
                {text("Design a Custom House", "صمّم بيتاً مخصصاً")}<ArrowRight size={15} className="directional" />
              </Link>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
