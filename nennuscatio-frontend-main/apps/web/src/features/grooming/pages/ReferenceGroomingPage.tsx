"use client";

import { ArrowRight, CalendarDays, Feather, Heart, ShieldCheck, UsersRound } from "lucide-react";
import { assets } from "@/mocks/data/assets";
import { useRepositories } from "@/shared/api/DataSourceProvider";
import { useCopy } from "@/shared/lib/copy";
import { Photo } from "@/shared/ui/Photo";
import { GroomingBooking } from "../components/GroomingBooking";

/**
 * The grooming page: the presentation and, in its steps, the real booking (9e) over the owner's pet
 * groups and packages (9a), the free times (9b) and paying (9d). The development-only mock mode has no
 * booking API, so it shows the presentation only.
 */
export function ReferenceGroomingPage() {
  const c = useCopy();
  const { source } = useRepositories();

  return (
    <div className="ref-grooming">
      <section className="ref-page-hero ref-page-hero--grooming">
        <Photo
          src={assets.groomingHero}
          alt={c.text("A cat receiving gentle grooming", "قطة تتلقى عناية لطيفة")}
          priority
          sizes="100vw"
        />
        <div>
          <p className="eyebrow">
            {c.text("NENNUS CATIO GROOMING", "عناية Nennus Catio")}
          </p>
          <h1>
            <span>{c.text("A little care.", "قليل من العناية.")}</span>
            <span>{c.text("A whole lot fresh.", "والكثير من الانتعاش.")}</span>
          </h1>
          <p>
            {c.text(
              "Gentle, professional grooming, available in-store or from the comfort of your home.",
              "عناية احترافية ولطيفة متاحة في المتجر أو من راحة منزلك.",
            )}
          </p>
          <a className="button button--primary ref-pill-button" href="#grooming-steps">
            {c.text("Book grooming", "احجز العناية")} <ArrowRight size={17} className="directional" />
          </a>
        </div>
      </section>

      <div className="ref-feature-strip ref-grooming__feature-strip">
        <Feature icon={Feather} title={c.text("Gentle care", "عناية لطيفة")} detail={c.text("Comfort-first grooming", "عناية تضع الراحة أولاً")} />
        <Feature icon={UsersRound} title={c.text("Experienced groomers", "مختصون ذوو خبرة")} detail={c.text("Professional & trusted", "احترافيون وموثوقون")} />
        <Feature icon={ShieldCheck} title={c.text("Pet-safe products", "منتجات آمنة للحيوانات")} detail={c.text("Gentle products and tools", "منتجات وأدوات لطيفة")} />
        <Feature icon={CalendarDays} title={c.text("Easy booking", "حجز سهل")} detail={c.text("Choose your preferred slot", "اختر الموعد المناسب")} />
      </div>

      {source === "api" ? (
        <GroomingBooking />
      ) : (
        <section id="grooming-steps" className="ref-section ref-grooming__section">
          <p className="ref-step__note" role="status">
            {c.text(
              "Booking needs the live system: run the website in API mode to book grooming.",
              "يتطلب الحجز النظام الفعلي: شغّل الموقع في وضع API لحجز العناية.",
            )}
          </p>
        </section>
      )}

      <section className="ref-grooming__care" aria-labelledby="gentle-care-title">
        <Photo src={assets.homeGrooming} alt={c.text("A relaxed cat receiving gentle home grooming", "قطة مرتاحة تتلقى عناية منزلية لطيفة")} sizes="100vw" />
        <div>
          <div className="ref-grooming__care-copy">
          <p className="eyebrow">{c.text("MORE THAN GROOMING", "أكثر من مجرد عناية")}</p>
          <h2 id="gentle-care-title"><span>{c.text("Gentle care, every", "عناية لطيفة")}</span><span>{c.text("step of the way.", "في كل خطوة.")}</span></h2>
          <p>{c.text("Our professional groomers, pet-safe products and comfort-first approach ensure a calm and positive experience for your pet.", "يضمن مختصونا ومنتجاتنا الآمنة ونهجنا الذي يضع الراحة أولاً تجربة هادئة وإيجابية لحيوانك.")}</p>
          </div>
          <div className="ref-grooming__care-points">
            <div><span className="ref-grooming__care-icon"><Feather size={27} /></span><p>{c.text("Comfort-first approach", "نهج يضع الراحة أولاً")}</p></div>
            <div><span className="ref-grooming__care-icon"><Heart size={27} /></span><p>{c.text("Professional groomers", "مختصون محترفون")}</p></div>
            <div><span className="ref-grooming__care-icon"><ShieldCheck size={27} /></span><p>{c.text("Pet-safe products", "منتجات آمنة للحيوانات")}</p></div>
          </div>
        </div>
      </section>
    </div>
  );
}

function Feature({ icon: Icon, title, detail }: { icon: typeof Feather; title: string; detail: string }) {
  return <div><Icon size={23} /><span><strong>{title}</strong><small>{detail}</small></span></div>;
}
