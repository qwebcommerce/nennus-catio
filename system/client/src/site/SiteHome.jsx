import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Gem, Headset, Heart, Leaf, Package, ShieldCheck, ShoppingBag, Truck } from "lucide-react";
import { money, pickName, productImage, productPrice, useCatalog, useCopy } from "./copy.js";
import { PETS } from "./pets.js";

const SERVICES = [
  {
    image: "/images/essentials.png",
    href: "/shop",
    title: ["Pet Food & Essentials", "الطعام والمستلزمات"],
    description: ["Quality nutrition and everyday essentials for your pet.", "تغذية عالية الجودة ومستلزمات يومية لحيوانك."],
    action: ["Shop now", "تسوق الآن"],
  },
  {
    image: "/images/reference-refresh/grooming-cat-hero.png",
    href: "/grooming",
    title: ["Pet Care Services", "خدمات رعاية الحيوانات"],
    description: ["Gentle grooming, in-store or in the comfort of your home.", "عناية لطيفة في المتجر أو في راحة منزلك."],
    action: ["Book a service", "احجز خدمة"],
  },
  {
    image: "/images/reference-refresh/pet-houses-hero.png",
    href: "/pet-houses",
    title: ["Pet Houses", "بيوت الحيوانات"],
    description: ["Browse ready models or ask about a custom design.", "تصفح التصاميم الجاهزة أو اسأل عن تصميم مخصص."],
    action: ["Explore houses", "استكشف البيوت"],
  },
  {
    image: "/images/reference-refresh/relocation-hero.png",
    href: "/relocation",
    title: ["Pet Relocation", "نقل الحيوانات"],
    description: ["Learn how to enquire about a move for your pet.", "تعرّف على كيفية الاستفسار عن نقل حيوانك."],
    action: ["Explore relocation", "استكشف خدمة النقل"],
  },
];

export function SiteHome() {
  const { locale, text } = useCopy();
  const { products } = useCatalog();
  const featured = products.filter((product) => !product.isPetHouse).slice(0, 5);

  return (
    <div className="ref-landing">
      <section className="ref-hero" aria-labelledby="ref-home-title">
        <img className="ref-hero__photo" src="/images/pets-hero.png" alt={text("A dog and cat resting together in a sunlit room", "كلب وقطة يستريحان معاً في غرفة مشرقة")} />
        <div className="ref-hero__copy">
          <h1 id="ref-home-title">
            <span>{text("A little care", "قليل من العناية")}</span>
            <span>{text("for a happier life.", "لحياة أسعد.")}</span>
          </h1>
          <p>{text("Everything your pet needs, from daily essentials and gentle grooming to a home made around them.", "كل ما يحتاجه حيوانك، من المستلزمات اليومية والعناية اللطيفة إلى بيت مصمم لأجله.")}</p>
          <div className="ref-hero__actions">
            <Link to="/shop?category=food" className="button button--secondary ref-pill-button">
              {text("Shop pet food", "تسوق طعام الحيوانات")}
              <ArrowRight size={17} className="directional" />
            </Link>
            <Link to="/grooming" className="button button--secondary ref-pill-button">
              {text("Book grooming", "احجز العناية")}
              <ArrowRight size={17} className="directional" />
            </Link>
            <Link to="/pet-houses" className="button button--secondary ref-pill-button">
              {text("Shop pet houses", "تسوق بيوت الحيوانات")}
              <ArrowRight size={17} className="directional" />
            </Link>
          </div>
        </div>
      </section>

      <div className="ref-feature-strip">
        {[
          [Truck, "Free delivery in Doha", "توصيل مجاني في الدوحة"],
          [Package, "30-Day returns", "إرجاع خلال ٣٠ يوماً"],
          [ShieldCheck, "Trusted care by professionals", "رعاية موثوقة من محترفين"],
          [Headset, "24/7 support", "دعم على مدار الساعة"],
        ].map(([Icon, en, ar]) => (
          <div key={en}>
            <Icon size={24} aria-hidden="true" />
            <span>{text(en, ar)}</span>
          </div>
        ))}
      </div>

      <section className="ref-section" aria-labelledby="ref-pets-title">
        <div className="ref-section__heading">
          <div>
            <h2 id="ref-pets-title">{text("Shop by Pet", "تسوق حسب الحيوان")}</h2>
            <p>{text("Find the perfect products for every member of your family.", "اعثر على المنتجات المثالية لكل فرد من عائلتك.")}</p>
          </div>
          <Link className="ref-inline-link" to="/shop">
            {text("All products", "كل المنتجات")}
            <ArrowRight size={16} className="directional" />
          </Link>
        </div>
        <div className="ref-pet-row">
          {PETS.map((pet) => (
            <Link key={pet.id} to={`/shop?pet=${pet.id}`} className="ref-pet-circle">
              <span className="ref-pet-circle__image"><img src={pet.image} alt="" /></span>
              <strong>{text(pet.en, pet.ar)}</strong>
            </Link>
          ))}
        </div>
      </section>

      <section className="ref-section ref-section--cards" aria-label={text("Explore Nennus Catio", "استكشف Nennus Catio")}>
        <div className="ref-service-cards">
          {SERVICES.map((item) => (
            <article className="ref-service-card" key={item.href}>
              <Link to={item.href} className="ref-service-card__photo"><img src={item.image} alt="" /></Link>
              <div>
                <h2>{text(item.title[0], item.title[1])}</h2>
                <p>{text(item.description[0], item.description[1])}</p>
                <Link to={item.href} className="ref-inline-link">
                  {text(item.action[0], item.action[1])}
                  <ArrowRight size={16} className="directional" />
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="ref-section ref-section--best-sellers" aria-labelledby="ref-featured-title">
        <div className="ref-section__heading">
          <div><h2 id="ref-featured-title">{text("Best Sellers", "الأكثر مبيعاً")}</h2></div>
          <Link to="/shop" className="ref-inline-link">
            {text("View all", "عرض الكل")}
            <ArrowRight size={16} className="directional" />
          </Link>
        </div>
        <div className="ref-featured-grid">
          {featured.map((product) => {
            const image = productImage(product);
            const variant = product.variants?.[0];
            return (
              <Link to={`/shop/product/${product.id}`} className="ref-featured-card" key={product.id}>
                {image ? <img src={image} alt={pickName(product, locale)} /> : <span className="photo-unavailable" />}
                <div>
                  <h3>{pickName(product, locale)}</h3>
                  <p>{pickName(product.category, locale) || text("Pet essentials", "مستلزمات الحيوانات")}</p>
                  {variant && <p>{locale === "en" ? variant.labelEn || variant.label : variant.label || variant.labelEn}</p>}
                  <div>
                    <strong>{money(productPrice(product))}</strong>
                    <span className="ref-featured-card__action"><ShoppingBag size={17} aria-hidden="true" /></span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <div className="ref-feature-strip ref-feature-strip--bottom">
        {[
          [Gem, "Premium Quality", "جودة ممتازة"],
          [Leaf, "Safe & Non-Toxic", "آمن وغير سام"],
          [Heart, "Happiness Guarantee", "ضمان السعادة"],
          [Truck, "Fast & Reliable Shipping", "شحن سريع وموثوق"],
        ].map(([Icon, en, ar]) => (
          <div key={en}>
            <Icon size={23} aria-hidden="true" />
            <span>{text(en, ar)}</span>
          </div>
        ))}
      </div>

      <section className="ref-house-banner" aria-labelledby="ref-house-banner-title">
        <img src="/images/reference-refresh/home-house-banner.png" alt={text("A cat resting in a woven wicker pet house", "قطة تستريح داخل بيت من الخوص")} />
        <div>
          <h2 id="ref-house-banner-title">{text("Homes Designed", "بيوت مصممة")}<br />{text("for Their World", "لعالمهم")}</h2>
          <p>{text("From ready-made houses to custom designs, create a space that feels like home.", "من البيوت الجاهزة إلى التصاميم المخصصة، اصنع مساحة تشعرهم بالراحة.")}</p>
          <Link to="/pet-houses" className="button button--primary ref-pill-button">
            {text("Explore pet houses", "استكشف البيوت")}
            <ArrowRight size={17} className="directional" />
          </Link>
        </div>
      </section>
    </div>
  );
}
