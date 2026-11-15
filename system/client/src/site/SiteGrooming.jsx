import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CalendarDays, Feather, Heart, ShieldCheck, UsersRound } from "lucide-react";
import { api } from "../api/client.js";
import { money, pickName, useCopy } from "./copy.js";

export function SiteGrooming() {
  const { locale, text } = useCopy();
  const [packages, setPackages] = useState([]);
  useEffect(() => {
    api("/api/shop/grooming/packages").then(setPackages).catch(() => setPackages([]));
  }, []);

  return (
    <div className="ref-grooming">
      <section className="ref-page-hero ref-page-hero--grooming">
        <img src="/images/reference-refresh/grooming-cat-hero.png" alt={text("A cat receiving gentle grooming", "قطة تتلقى عناية لطيفة")} />
        <div>
          <p className="eyebrow">{text("NENNUS CATIO GROOMING", "عناية Nennus Catio")}</p>
          <h1>
            <span>{text("A little care.", "قليل من العناية.")}</span>
            <span>{text("A whole lot fresh.", "والكثير من الانتعاش.")}</span>
          </h1>
          <p>{text("Gentle, professional grooming, available in-store or from the comfort of your home.", "عناية احترافية ولطيفة متاحة في المتجر أو من راحة منزلك.")}</p>
          <a className="button button--primary ref-pill-button" href="#grooming-steps">
            {text("Book grooming", "احجز العناية")} <ArrowRight size={17} className="directional" />
          </a>
        </div>
      </section>

      <div className="ref-feature-strip ref-grooming__feature-strip">
        <Feature icon={Feather} title={text("Gentle care", "عناية لطيفة")} detail={text("Comfort-first grooming", "عناية تضع الراحة أولاً")} />
        <Feature icon={UsersRound} title={text("Experienced groomers", "مختصون ذوو خبرة")} detail={text("Professional & trusted", "احترافيون وموثوقون")} />
        <Feature icon={ShieldCheck} title={text("Pet-safe products", "منتجات آمنة للحيوانات")} detail={text("Gentle products and tools", "منتجات وأدوات لطيفة")} />
        <Feature icon={CalendarDays} title={text("Easy booking", "حجز سهل")} detail={text("Choose your preferred slot", "اختر الموعد المناسب")} />
      </div>

      <section id="grooming-steps" className="ref-section ref-grooming__section">
        <div className="ref-section__heading">
          <div>
            <h2>{text("Choose a service", "اختر خدمة")}</h2>
            <p>{text("Pick a package, then choose a time.", "اختر الباقة ثم حدّد الموعد.")}</p>
          </div>
          <Link to="/shop/grooming/bookings" className="ref-inline-link">{text("My bookings", "حجوزاتي")}<ArrowRight size={16} className="directional" /></Link>
        </div>
        <div className="ref-shop__grid">
          {packages.map((row) => (
            <Link key={row.id} to={`/shop/grooming/${row.id}`} className="ref-shop-card">
              <div className="ref-shop-card__body">
                <small>{row.durationMin} {text("min", "دقيقة")}</small>
                <h2>{pickName(row, locale)}</h2>
                <p>{locale === "en" ? row.includedEn || row.included : row.included || row.includedEn}</p>
                <div className="ref-shop-card__bottom"><strong>{money(row.price)}</strong></div>
                <span className="ref-shop-card__action">{text("Book this service", "احجز هذه الخدمة")}<ArrowRight size={14} className="directional" /></span>
              </div>
            </Link>
          ))}
        </div>
        {!packages.length && <p role="status">{text("Grooming packages will appear here once they are added.", "ستظهر باقات العناية هنا بعد إضافتها.")}</p>}
      </section>

      <section className="ref-grooming__care" aria-labelledby="gentle-care-title">
        <img src="/images/reference-refresh/home-grooming-cat.png" alt={text("A relaxed cat receiving gentle home grooming", "قطة مرتاحة تتلقى عناية منزلية لطيفة")} />
        <div>
          <div className="ref-grooming__care-copy">
            <p className="eyebrow">{text("MORE THAN GROOMING", "أكثر من مجرد عناية")}</p>
            <h2 id="gentle-care-title"><span>{text("Gentle care, every", "عناية لطيفة")}</span><span>{text("step of the way.", "في كل خطوة.")}</span></h2>
            <p>{text("Our professional groomers, pet-safe products and comfort-first approach ensure a calm and positive experience for your pet.", "يضمن مختصونا ومنتجاتنا الآمنة ونهجنا الذي يضع الراحة أولاً تجربة هادئة وإيجابية لحيوانك.")}</p>
          </div>
          <div className="ref-grooming__care-points">
            <div><span className="ref-grooming__care-icon"><Feather size={27} /></span><p>{text("Comfort-first approach", "نهج يضع الراحة أولاً")}</p></div>
            <div><span className="ref-grooming__care-icon"><Heart size={27} /></span><p>{text("Professional groomers", "مختصون محترفون")}</p></div>
            <div><span className="ref-grooming__care-icon"><ShieldCheck size={27} /></span><p>{text("Pet-safe products", "منتجات آمنة للحيوانات")}</p></div>
          </div>
        </div>
      </section>
    </div>
  );
}

function Feature({ icon: Icon, title, detail }) {
  return <div><Icon size={23} /><span><strong>{title}</strong><small>{detail}</small></span></div>;
}
