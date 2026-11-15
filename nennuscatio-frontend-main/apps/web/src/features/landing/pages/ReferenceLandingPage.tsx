"use client";

import {
  ArrowRight,
  Headset,
  Gem,
  Leaf,
  Heart,
  Package,
  ShoppingBag,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { OfferPrice } from "@/features/shop/components/OfferPrice";
import { cheapestPack } from "@/features/shop/lib/catalogue";
import { FeaturedOffers } from "../components/FeaturedOffers";
import { Link } from "@/i18n/navigation";
import { useCatalog } from "@/shared/api/catalog";
import { assets } from "@/mocks/data/assets";
import { publicPetTypes } from "@/mocks/data/public-pets";
import { EMPTY_TEXT } from "@/shared/api/site-settings";
import { usePublicSettings } from "@/shared/api/use-public-settings";
import { useCopy } from "@/shared/lib/copy";
import { Photo } from "@/shared/ui/Photo";
import { ActionLink } from "@/shared/ui/ActionLink";

export function ReferenceLandingPage() {
  const c = useCopy();
  const catalog = useCatalog();
  const { settings } = usePublicSettings();
  const headline = c.local(settings?.headline ?? EMPTY_TEXT);
  const featuredIds = [
    "cat-food",
    "cat-treats",
    "dog-food",
    "cat-litter",
    "bird-seed",
  ];
  // Until the owner marks featured products in the admin (6b), the prototype's picks are shown.
  const featured = featuredIds
    .map((id) => catalog.products.find((product) => product.id === id))
    .filter((product) => product?.active);
  const serviceCards = [
    {
      image: assets.essentials,
      title: c.text("Pet Food & Essentials", "الطعام والمستلزمات"),
      description: c.text(
        "Quality nutrition and everyday essentials for your pet.",
        "تغذية عالية الجودة ومستلزمات يومية لحيوانك.",
      ),
      action: c.text("Shop now", "تسوق الآن"),
      href: "/shop",
    },
    {
      image: assets.groomingHero,
      title: c.text("Pet Care Services", "خدمات رعاية الحيوانات"),
      description: c.text(
        "Gentle grooming, in-store or in the comfort of your home.",
        "عناية لطيفة في المتجر أو في راحة منزلك.",
      ),
      action: c.text("Book a service", "احجز خدمة"),
      href: "/grooming",
    },
    {
      image: assets.housesHero,
      title: c.text("Pet Houses", "بيوت الحيوانات"),
      description: c.text(
        "Browse ready models or ask about a custom design.",
        "تصفح التصاميم الجاهزة أو اسأل عن تصميم مخصص.",
      ),
      action: c.text("Explore houses", "استكشف البيوت"),
      href: "/pet-houses",
    },
    {
      image: assets.relocationHero,
      title: c.text("Pet Relocation", "نقل الحيوانات"),
      description: c.text(
        "Learn how to enquire about a move for your pet.",
        "تعرّف على كيفية الاستفسار عن نقل حيوانك.",
      ),
      action: c.text("Explore relocation", "استكشف خدمة النقل"),
      href: "/relocation",
    },
  ];

  return (
    <div className="ref-landing">
      <section className="ref-hero" aria-labelledby="ref-home-title">
        <Photo
          src={assets.hero}
          alt={c.text(
            "A dog and cat resting together in a sunlit room",
            "كلب وقطة يستريحان معاً في غرفة مشرقة",
          )}
          className="ref-hero__photo"
          priority
          sizes="100vw"
        />
        <div className="ref-hero__copy">
          <h1 id="ref-home-title">{headline === "A little care for a happier life." ? <><span>A little care</span><span>for a happier life.</span></> : headline}</h1>
          <p>{c.local(settings?.description ?? EMPTY_TEXT)}</p>
          <div className="ref-hero__actions">
            <ActionLink href="/shop?category=food" variant="secondary" className="ref-pill-button">
              {c.text("Shop pet food", "تسوق طعام الحيوانات")}
              <ArrowRight size={17} className="directional" />
            </ActionLink>
            <ActionLink href="/grooming/book" variant="secondary" className="ref-pill-button">
              {c.text("Book grooming", "احجز العناية")}
              <ArrowRight size={17} className="directional" />
            </ActionLink>
            <ActionLink href="/pet-houses" variant="secondary" className="ref-pill-button">
              {c.text("Shop pet houses", "تسوق بيوت الحيوانات")}
              <ArrowRight size={17} className="directional" />
            </ActionLink>
          </div>
        </div>
      </section>

      <div id="about" className="ref-feature-strip">
        {[
          { icon: Truck, en: "Free delivery in Doha", ar: "توصيل مجاني في الدوحة" },
          { icon: Package, en: "30-Day returns", ar: "إرجاع خلال ٣٠ يوماً" },
          { icon: ShieldCheck, en: "Trusted care by professionals", ar: "رعاية موثوقة من محترفين" },
          { icon: Headset, en: "24/7 support", ar: "دعم على مدار الساعة" },
        ].map((item) => (
          <div key={item.en}>
            <item.icon size={24} aria-hidden="true" />
            <span>{c.text(item.en, item.ar)}</span>
          </div>
        ))}
      </div>

      <section className="ref-section" aria-labelledby="ref-pets-title">
        <div className="ref-section__heading">
          <div>
            <h2 id="ref-pets-title">{c.text("Shop by Pet", "تسوق حسب الحيوان")}</h2>
            <p>{c.text("Find the perfect products for every member of your family.", "اعثر على المنتجات المثالية لكل فرد من عائلتك.")}</p>
          </div>
          <Link className="ref-inline-link" href="/shop">
            {c.text("All products", "كل المنتجات")}
            <ArrowRight size={16} className="directional" />
          </Link>
        </div>
        <div className="ref-pet-row">
          {publicPetTypes.map((pet) => (
            <Link key={pet.id} href={`/shop?pet=${pet.id}`} className="ref-pet-circle">
              <span className="ref-pet-circle__image">
                <Photo src={pet.image} alt="" sizes="(max-width: 700px) 90px, 120px" />
              </span>
              <strong>{c.local(pet.name)}</strong>
            </Link>
          ))}
        </div>
      </section>

      <section className="ref-section ref-section--cards" aria-label={c.text("Explore Nennus Catio", "استكشف Nennus Catio")}>
        <div className="ref-service-cards">
          {serviceCards.map((item) => (
            <article className="ref-service-card" key={item.href}>
              <Link href={item.href} className="ref-service-card__photo">
                <Photo src={item.image} alt="" sizes="(max-width: 650px) 100vw, (max-width: 1100px) 50vw, 25vw" />
              </Link>
              <div>
                <h2>{item.title}</h2>
                <p>{item.description}</p>
                <Link href={item.href} className="ref-inline-link">
                  {item.action}
                  <ArrowRight size={16} className="directional" />
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <FeaturedOffers />

      <section className="ref-section ref-section--best-sellers" aria-labelledby="ref-featured-title">
        <div className="ref-section__heading">
          <div>
            <h2 id="ref-featured-title">{c.text("Best Sellers", "الأكثر مبيعاً")}</h2>
          </div>
          <Link href="/shop" className="ref-inline-link">
            {c.text("View all", "عرض الكل")}
            <ArrowRight size={16} className="directional" />
          </Link>
        </div>
        <div className="ref-featured-grid">
          {featured.map((product) => product && (
            <Link href={`/shop/${product.id}`} className="ref-featured-card" key={product.id}>
              <Photo src={product.image} alt={c.local(product.name)} sizes="(max-width: 700px) 46vw, 20vw" />
              <div>
                <h3>{c.local(product.name)}</h3>
                <p>{c.text(product.category === "food" ? "Pet food" : product.category === "care" ? "Pet care" : "Pet essentials", product.category === "food" ? "طعام الحيوانات" : product.category === "care" ? "العناية بالحيوانات" : "مستلزمات الحيوانات")}</p>
                <p>{c.local(product.variants[0].label)}</p>
                <div>
                  <OfferPrice price={cheapestPack(product).price} salePrice={cheapestPack(product).salePrice} />
                  <span className="ref-featured-card__action"><ShoppingBag size={17} aria-hidden="true" /></span>
                </div>
              </div>
            </Link>
          ))}
        </div>
        <p className="ref-best-sellers-note">{c.text("Demo selection · products and prices are for preview only.", "اختيار تجريبي · المنتجات والأسعار للمعاينة فقط.")}</p>
      </section>

      <div className="ref-feature-strip ref-feature-strip--bottom">
        {[
          { icon: Gem, en: "Premium Quality", ar: "جودة ممتازة" },
          { icon: Leaf, en: "Safe & Non-Toxic", ar: "آمن وغير سام" },
          { icon: Heart, en: "Happiness Guarantee", ar: "ضمان السعادة" },
          { icon: Truck, en: "Fast & Reliable Shipping", ar: "شحن سريع وموثوق" },
        ].map((item) => (
          <div key={item.en}>
            <item.icon size={23} aria-hidden="true" />
            <span>{c.text(item.en, item.ar)}</span>
          </div>
        ))}
      </div>

      <section className="ref-house-banner" aria-labelledby="ref-house-banner-title">
        <Photo src={assets.homeHouseBanner} alt={c.text("A cat resting in a woven wicker pet house", "قطة تستريح داخل بيت من الخوص")} sizes="100vw" />
        <div>
          <h2 id="ref-house-banner-title">{c.text("Homes Designed", "بيوت مصممة")}<br />{c.text("for Their World", "لعالمهم")}</h2>
          <p>{c.text("From ready-made houses to custom designs, create a space that feels like home.", "من البيوت الجاهزة إلى التصاميم المخصصة، اصنع مساحة تشعرهم بالراحة.")}</p>
          <ActionLink href="/pet-houses" className="ref-pill-button">
            {c.text("Explore pet houses", "استكشف البيوت")}
            <ArrowRight size={17} className="directional" />
          </ActionLink>
        </div>
      </section>
    </div>
  );
}
