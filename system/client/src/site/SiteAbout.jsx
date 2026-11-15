import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Heart, Leaf, UsersRound } from "lucide-react";
import { useCopy } from "./copy.js";

const VALUES = [
  {
    id: "care",
    icon: Leaf,
    image: "/images/reference-refresh/contact-hero.png",
    title: ["Thoughtful Care", "رعاية باهتمام"],
    description: ["Every product, service and experience should make life a little better for pets and the people who love them.", "كل منتج وخدمة وتجربة يجب أن تجعل الحياة أفضل للحيوانات الأليفة ولمن يحبونها."],
    alt: ["A fluffy cat enjoying a gentle touch", "قطة تستمتع بلمسة حانية"],
  },
  {
    id: "expertise",
    icon: UsersRound,
    image: "/images/reference-refresh/about-expertise-dog.png",
    title: ["Trusted Expertise", "خبرة موثوقة"],
    description: ["From grooming to everyday essentials, we believe good care starts with people and products you can trust.", "من العناية إلى المستلزمات اليومية، نؤمن بأن الرعاية الجيدة تبدأ بأشخاص ومنتجات يمكنك الوثوق بهم."],
    alt: ["A golden retriever being gently brushed", "كلب غولدن ريتريفر يتم تمشيطه بلطف"],
  },
  {
    id: "comfort",
    icon: Heart,
    image: "/images/reference-refresh/about-made-around-cat.png",
    title: ["Made Around Them", "مصمّم لأجلهم"],
    description: ["Every pet is different. Their care, comfort and spaces should be too.", "كل حيوان أليف مختلف، وكذلك يجب أن تكون رعايته وراحته ومساحته الخاصة."],
    alt: ["A cat relaxing inside a cardboard pet house", "قطة تستريح داخل بيت من الورق المقوّى"],
  },
];

export function SiteAbout() {
  const { text } = useCopy();
  return (
    <div className="about-page">
      <section className="about-hero" aria-labelledby="about-heading">
        <img className="about-hero__photo" src="/images/reference-refresh/about-hero.png" alt={text("A golden retriever and a fluffy cat resting together in a sunlit home", "كلب غولدن ريتريفر وقطة يستريحان معاً في منزل مشمس")} />
        <div className="about-hero__copy">
          <p className="about-eyebrow">{text("OUR STORY", "قصتنا")}</p>
          <h1 id="about-heading">
            <span>{text("A little love.", "قليل من الحب.")}</span>
            <span>{text("A whole world of care.", "وعالم كامل من الرعاية.")}</span>
          </h1>
          <p>{text("Nennus Catio began with a simple belief: our pets deserve care that feels as thoughtful as the love they give us.", "بدأت Nennus Catio بإيمان بسيط: حيواناتنا الأليفة تستحق رعاية مدروسة تليق بالحب الذي تمنحنا إياه.")}</p>
        </div>
      </section>
      <section className="about-story" aria-labelledby="about-story-heading">
        <img className="about-story__photo" src="/images/reference-refresh/about-story-cat.png" alt={text("A long-haired cat sitting in a wicker basket beside a sunny window", "قطة طويلة الشعر في سلة خوص بجانب نافذة مشمسة")} />
        <div className="about-story__copy">
          <p className="about-eyebrow">{text("HOW IT STARTED", "كيف بدأت الحكاية")}</p>
          <h2 id="about-story-heading">
            <span>{text("It started with cats.", "بدأت الحكاية مع القطط.")}</span>
            <span>{text("And grew into something more.", "ثم نمت لتصبح أكثر من ذلك.")}</span>
          </h2>
          <p>{text("Nennus Catio was created around a genuine love for cats and a desire to make caring for them simpler, better and more thoughtful.", "نشأت Nennus Catio من حب حقيقي للقطط ورغبة في جعل العناية بها أبسط وأفضل وأكثر اهتماماً.")}</p>
          <p>{text("What began with everyday essentials has grown into a wider world of care — from trusted products and professional grooming to thoughtfully designed pet houses.", "ما بدأ بالمستلزمات اليومية توسّع إلى عالم أرحب من الرعاية، من المنتجات الموثوقة والعناية الاحترافية إلى بيوت الحيوانات المصممة بعناية.")}</p>
          <p>{text("And we’re still growing.", "وما زلنا ننمو.")}</p>
        </div>
      </section>
      <section className="about-values" aria-labelledby="about-values-heading">
        <p className="about-eyebrow">{text("WHAT WE BELIEVE", "ما نؤمن به")}</p>
        <h2 id="about-values-heading">{text("Care should feel personal.", "رعاية تشعرك بالاهتمام.")}</h2>
        <div className="about-values__grid">
          {VALUES.map((value) => {
            const Icon = value.icon;
            return (
              <article className={`about-value about-value--${value.id}`} key={value.id}>
                <img className="about-value__photo" src={value.image} alt={text(value.alt[0], value.alt[1])} />
                <div className="about-value__body">
                  <span className="about-value__icon" aria-hidden="true"><Icon size={23} strokeWidth={1.6} /></span>
                  <h3>{text(value.title[0], value.title[1])}</h3>
                  <p>{text(value.description[0], value.description[1])}</p>
                </div>
              </article>
            );
          })}
        </div>
      </section>
      <section className="about-home" aria-labelledby="about-home-heading">
        <img className="about-home__photo" src="/images/reference-refresh/about-qatar-light.png" alt={text("A cat beside the Doha waterfront with the West Bay skyline at sunset", "قطة عند واجهة الدوحة البحرية مع أفق الخليج الغربي عند الغروب")} />
        <div className="about-home__copy">
          <p className="about-eyebrow">{text("OUR HOME", "موطننا")}</p>
          <h2 id="about-home-heading">
            <span>{text("Born in Qatar.", "من قطر.")}</span>
            <span>{text("Built around the pets we love.", "لأجل الحيوانات التي نحبها.")}</span>
          </h2>
          <p>{text("Nennus Catio is proudly based in Qatar, built around the pets, people and everyday realities of life here. From products and services to spaces, education and community, our goal is simple: to make thoughtful pet care easier, and a little brighter, for every pet and the people who love them.", "نفخر بأن Nennus Catio تنطلق من قطر، حول الحيوانات والأشخاص وتفاصيل الحياة اليومية هنا. من المنتجات والخدمات إلى المساحات والتوعية والمجتمع، هدفنا بسيط: جعل العناية المدروسة بالحيوانات أسهل وأكثر إشراقاً لكل حيوان ولمن يحبونه.")}</p>
          <div className="about-home__actions">
            <Link to="/shop" className="button button--primary">{text("Shop Nennus Catio", "تسوّق Nennus Catio")}<ArrowRight size={15} aria-hidden="true" /></Link>
            <Link to="/grooming" className="button button--secondary">{text("Book a Service", "احجز خدمة")}<ArrowRight size={15} aria-hidden="true" /></Link>
          </div>
        </div>
      </section>
    </div>
  );
}
