"use client";
import { useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  ShoppingBag,
  Heart,
  ShieldCheck,
  PawPrint,
  Check,
  Scissors,
  Truck,
  CreditCard,
} from "lucide-react";
import { ActionLink } from "@/shared/ui/ActionLink";
import { Photo } from "@/shared/ui/Photo";
import { Link } from "@/i18n/navigation";
import { useCopy } from "@/shared/lib/copy";
import { useBusiness } from "@/mocks/MockDataProvider";
import { assets } from "@/mocks/data/assets";
import { shopPetTypes, petCategories } from "@/mocks/data/business";
import { EMPTY_TEXT } from "@/shared/api/site-settings";
import { usePublicSettings } from "@/shared/api/use-public-settings";
import { Notice } from "@/shared/ui/BusinessUI";
const petTileImages: Record<(typeof shopPetTypes)[number]["id"], string> = {
  cats: assets.cat,
  birds: assets.bird,
  pets: assets.hero,
  dogs: assets.grooming,
};
export function LandingPage() {
  const c = useCopy(),
    data = useBusiness(),
    { settings } = usePublicSettings();
  const [pet, setPet] = useState("adult-cat");
  return (
    <>
      <section className="home-hero">
        <Photo
          src={assets.hero}
          alt={c.text(
            "Golden retriever and ragdoll cat resting together",
            "كلب وقطة يستريحان معاً",
          )}
          priority
          className="hero-photo"
        />
        <div className="hero-copy">
          <p className="eyebrow">
            {c.text("PETS MAKE A BRIGHTER TOMORROW", "رعاية اليوم لسعادة الغد")}
          </p>
          <h1>{c.local(settings?.headline ?? EMPTY_TEXT)}</h1>
          <p className="hero-description">
            {c.local(settings?.description ?? EMPTY_TEXT)}
          </p>
          <div className="hero-actions">
            <ActionLink href="/shop">
              <ShoppingBag size={18} />
              {c.text("Shop Now", "تسوق الآن")}
              <ArrowRight size={15} className="directional" />
            </ActionLink>
            <ActionLink href="/grooming" variant="secondary">
              <CalendarDays size={18} />
              {c.text("Book Grooming", "احجز العناية")}
            </ActionLink>
          </div>
          <div className="hero-values">
            {[
              {
                icon: PawPrint,
                en: "Thoughtful care",
                ar: "عناية لطيفة",
                sub: "For everyday wellbeing",
                subAr: "لراحة حيوانك اليومية",
              },
              {
                icon: Heart,
                en: "Happy pets",
                ar: "حيوانات سعيدة",
                sub: "Happier lives",
                subAr: "حياة أكثر سعادة",
              },
              {
                icon: ShieldCheck,
                en: "A little more care",
                ar: "المزيد من العناية",
                sub: "Shop & grooming",
                subAr: "التسوق والعناية",
              },
            ].map((v) => (
              <div key={v.en}>
                <v.icon size={26} />
                <span>
                  <strong>{c.text(v.en, v.ar)}</strong>
                  <small>{c.text(v.sub, v.subAr)}</small>
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="home-section">
        <div className="pet-tiles">
          {shopPetTypes.map((p) => (
            <Link
              key={p.id}
              href={`/shop?pet=${p.id}`}
              className={`pet-tile pet-tile--${p.id}`}
            >
              <Photo
                src={petTileImages[p.id]}
                alt={c.local(p.name)}
                sizes="(max-width: 800px) 45vw, (max-width: 1050px) 23vw, 12vw"
              />
              <div>
                <small>{c.text("Shop for", "تسوق من أجل")}</small>
                <h2>{c.local(p.name)}</h2>
                <p>
                  {c.text(
                    "Food · Care · Accessories",
                    "طعام · عناية · إكسسوارات",
                  )}
                </p>
                <span className="button button--quiet">
                  {c.text("Shop Now", "تسوق الآن")}
                  <ArrowRight size={14} className="directional" />
                </span>
              </div>
            </Link>
          ))}
        </div>
        <div className="section-heading">
          <h2>{c.text("Our Services", "خدماتنا")}</h2>
          <p>
            {c.text(
              "Everyday essentials and thoughtful care for your companion.",
              "مستلزمات يومية وعناية لطيفة لرفيقك.",
            )}
          </p>
        </div>
        <div className="service-grid service-grid--with-houses">
          {[
            {
              image: assets.essentials,
              title: c.text("Shop Products", "منتجات المتجر"),
              description: c.text(
                "Discover food, care and accessories for your pet.",
                "اكتشف الطعام والعناية والإكسسوارات لحيوانك.",
              ),
              href: "/shop",
              action: c.text("Shop Now", "تسوق الآن"),
            },
            {
              image: assets.grooming,
              title: c.text("Grooming Packages", "باقات العناية"),
              description: c.text(
                "The right care, tailored to your pet's category.",
                "عناية مناسبة لفئة حيوانك الأليف.",
              ),
              href: "/grooming",
              action: c.text("Book Grooming", "احجز العناية"),
            },
            {
              image: "/images/pet-houses/cat-terracotta-villa.jpg",
              title: c.text("Pet Houses", "بيوت الحيوانات"),
              description: c.text(
                "Explore ready-model homes or discuss a custom design.",
                "استكشف التصاميم الجاهزة أو ناقش تصميماً مخصصاً.",
              ),
              href: "/pet-houses",
              action: c.text("Explore Models", "استكشف التصاميم"),
            },
          ].map((s) => (
            <article className="service-card" key={s.href}>
              <Photo src={s.image} alt={s.title} />
              <div>
                <h3>{s.title}</h3>
                <p>{s.description}</p>
                <ActionLink href={s.href} variant="quiet">
                  {s.action}
                  <ArrowRight size={14} className="directional" />
                </ActionLink>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="grooming-band">
        <div className="grooming-intro">
          <p className="eyebrow">
            NENNUS CATIO · {c.text("GROOMING", "العناية")}
          </p>
          <h2>{c.text("Professional Grooming", "عناية احترافية")}</h2>
          <p>
            {c.text("For a Happier, Healthier Pet", "لحيوان أكثر سعادة وراحة")}
          </p>
          <label className="field">
            <span>{c.text("Your pet category", "فئة الحيوان")}</span>
            <select value={pet} onChange={(e) => setPet(e.target.value)}>
              {petCategories.map((p) => (
                <option key={p.id} value={p.id}>
                  {c.local(p.name)}
                </option>
              ))}
            </select>
          </label>
          <ActionLink href="/grooming">
            <Scissors size={16} />
            {c.text("Book Appointment", "احجز موعداً")}
          </ActionLink>
        </div>
        {data.packages
          .filter((p) => p.petCategory === pet && p.active)
          .map((p) => (
            <article key={p.id} className="package-preview">
              <Photo src={p.image} alt={c.local(p.name)} />
              <div>
                <h3>
                  {c.text(
                    p.tier === "basic" ? "Basic Grooming" : "Full Grooming",
                    p.tier === "basic" ? "العناية الأساسية" : "العناية الكاملة",
                  )}
                </h3>
                <ul>
                  {p.inclusions.map((x) => (
                    <li key={x.en}>
                      <Check size={14} />
                      {c.local(x)}
                    </li>
                  ))}
                </ul>
                <strong>{c.money(p.price)}</strong>
                <small>
                  {p.duration}{" "}
                  {c.text("minutes · demo price", "دقيقة · سعر تجريبي")}
                </small>
                <ActionLink
                  href={`/grooming/book?package=${p.id}`}
                  variant="quiet"
                >
                  {c.text("Choose a Slot", "اختر موعداً")}
                  <ArrowRight size={14} className="directional" />
                </ActionLink>
              </div>
            </article>
          ))}
      </section>
      <section className="home-section how-grid">
        <article id="about" className="care-story">
          <Photo
            src={assets.cat}
            alt={c.text("A relaxed ragdoll cat", "قطة تستريح")}
          />
          <div>
            <h2>
              {c.text(
                "A little care. A happier pet.",
                "عناية لطيفة. حيوان سعيد.",
              )}
            </h2>
            <p>
              {c.text(
                "Everyday essentials, a freshly brushed coat, and a team ready to help. Shop and grooming, made simple.",
                "مستلزمات يومية وفرو نظيف وفريق جاهز للمساعدة. تسوق وعناية ببساطة.",
              )}
            </p>
            <ActionLink href="/grooming" variant="quiet">
              {c.text("Explore Grooming", "اكتشف العناية")}
            </ActionLink>
          </div>
        </article>
        <div className="how-it-works">
          <h2>{c.text("How It Works", "كيف يعمل")}</h2>
          <div>
            {[
              {
                icon: ShoppingBag,
                en: "Choose category",
                ar: "اختر الفئة",
                sub: "Find the right product or care",
                arSub: "اعثر على المنتج أو العناية",
              },
              {
                icon: CalendarDays,
                en: "Choose date & slot",
                ar: "اختر التاريخ والوقت",
                sub: "Delivery or grooming availability",
                arSub: "مواعيد التوصيل أو العناية",
              },
              {
                icon: CreditCard,
                en: "Review & pay",
                ar: "راجع وادفع",
                sub: "Simulated payment in this preview",
                arSub: "دفع تجريبي في هذه النسخة",
              },
              {
                icon: Heart,
                en: "We take care",
                ar: "نحن نهتم",
                sub: "Your pet's next happy moment",
                arSub: "لحظة سعادة جديدة لحيوانك",
              },
            ].map((s, i) => (
              <article key={s.en}>
                <s.icon size={27} />
                <strong>
                  {i + 1}. {c.text(s.en, s.ar)}
                </strong>
                <p>{c.text(s.sub, s.arSub)}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
      <div className="benefit-strip">
        {[
          { icon: Truck, en: "Delivery or pickup", ar: "توصيل أو استلام" },
          {
            icon: CalendarDays,
            en: "Choose your appointment",
            ar: "اختر موعدك",
          },
          { icon: ShieldCheck, en: "Thoughtful pet care", ar: "عناية لطيفة" },
          { icon: Heart, en: "In Doha, Qatar", ar: "في الدوحة، قطر" },
        ].map((x) => (
          <div key={x.en}>
            <x.icon size={26} />
            {c.text(x.en, x.ar)}
          </div>
        ))}
      </div>
      <section className="home-cta">
        <Photo src={assets.hero} alt="" />
        <div>
          <h2>
            {c.text(
              "Let's Make Your Pet's Life Better",
              "لنجعل حياة حيوانك أفضل",
            )}
          </h2>
          <p>
            {c.text(
              "Shop essentials or book a little care — we're here for you.",
              "تسوق المستلزمات أو احجز العناية — نحن هنا من أجلك.",
            )}
          </p>
          <div className="hero-actions">
            <ActionLink href="/shop">
              {c.text("Shop Now", "تسوق الآن")}
            </ActionLink>
            <ActionLink href="/grooming" variant="secondary">
              {c.text("Book Grooming", "احجز العناية")}
            </ActionLink>
          </div>
        </div>
      </section>
      <div className="home-demo-note">
        <Notice />
      </div>
    </>
  );
}
