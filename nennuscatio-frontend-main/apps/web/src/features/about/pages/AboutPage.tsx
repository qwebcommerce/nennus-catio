"use client";

import { ArrowRight, Heart, Leaf, UsersRound } from "lucide-react";
import { aboutCopy } from "@/mocks/data/about";
import { assets } from "@/mocks/data/assets";
import { useCopy } from "@/shared/lib/copy";
import { ActionLink } from "@/shared/ui/ActionLink";
import { Photo } from "@/shared/ui/Photo";

const valueIcons = { care: Leaf, expertise: UsersRound, comfort: Heart };

export function AboutPage() {
  const c = useCopy();
  return (
    <div className="about-page">
      <section className="about-hero" aria-labelledby="about-heading">
        <Photo
          src={assets.aboutHero}
          alt={c.text(
            "A golden retriever and a fluffy cat resting together in a sunlit home",
            "كلب غولدن ريتريفر وقطة يستريحان معاً في منزل مشمس",
          )}
          className="about-hero__photo"
          sizes="(max-width: 1600px) 100vw, 1600px"
          priority
        />
        <div className="about-hero__copy">
          <p className="about-eyebrow">{c.text("OUR STORY", "قصتنا")}</p>
          <h1 id="about-heading">
            <span>{c.local(aboutCopy.heroLineOne)}</span>
            <span>{c.local(aboutCopy.heroLineTwo)}</span>
          </h1>
          <p>{c.local(aboutCopy.heroDescription)}</p>
        </div>
      </section>

      <section className="about-story" aria-labelledby="about-story-heading">
        <Photo
          src={assets.aboutStory}
          alt={c.text(
            "A long-haired cat sitting in a wicker basket beside a sunny window",
            "قطة طويلة الشعر في سلة خوص بجانب نافذة مشمسة",
          )}
          className="about-story__photo"
          sizes="(max-width: 760px) 90vw, (max-width: 1600px) 43vw, 688px"
        />
        <div className="about-story__copy">
          <p className="about-eyebrow">
            {c.text("HOW IT STARTED", "كيف بدأت الحكاية")}
          </p>
          <h2 id="about-story-heading">
            <span>{c.local(aboutCopy.storyLineOne)}</span>
            <span>{c.local(aboutCopy.storyLineTwo)}</span>
          </h2>
          {aboutCopy.storyParagraphs.map((paragraph) => (
            <p key={paragraph.en}>{c.local(paragraph)}</p>
          ))}
        </div>
      </section>

      <section className="about-values" aria-labelledby="about-values-heading">
        <p className="about-eyebrow">
          {c.text("WHAT WE BELIEVE", "ما نؤمن به")}
        </p>
        <h2 id="about-values-heading">
          {c.text("Care should feel personal.", "رعاية تشعرك بالاهتمام.")}
        </h2>
        <div className="about-values__grid">
          {aboutCopy.values.map((value) => {
            const Icon = valueIcons[value.id];
            return (
              <article
                className={`about-value about-value--${value.id}`}
                key={value.id}
              >
                <Photo
                  src={value.image}
                  alt={c.local(value.alt)}
                  className="about-value__photo"
                  sizes="(max-width: 600px) 90vw, (max-width: 1600px) 29vw, 464px"
                />
                <div className="about-value__body">
                  <span className="about-value__icon" aria-hidden="true">
                    <Icon size={23} strokeWidth={1.6} />
                  </span>
                  <h3>{c.local(value.title)}</h3>
                  <p>{c.local(value.description)}</p>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="about-home" aria-labelledby="about-home-heading">
        <Photo
          src={assets.aboutQatar}
          alt={c.text(
            "A cat beside the Doha waterfront with the West Bay skyline at sunset",
            "قطة عند واجهة الدوحة البحرية مع أفق الخليج الغربي عند الغروب",
          )}
          className="about-home__photo"
          sizes="(max-width: 1600px) 100vw, 1600px"
        />
        <div className="about-home__copy">
          <p className="about-eyebrow">{c.text("OUR HOME", "موطننا")}</p>
          <h2 id="about-home-heading">
            <span>{c.local(aboutCopy.homeLineOne)}</span>
            <span>{c.local(aboutCopy.homeLineTwo)}</span>
          </h2>
          <p>{c.local(aboutCopy.homeDescription)}</p>
          <div className="about-home__actions">
            <ActionLink href="/shop">
              {c.text("Shop Nennus Catio", "تسوّق Nennus Catio")}
              <ArrowRight size={15} aria-hidden="true" />
            </ActionLink>
            <ActionLink href="/grooming" variant="secondary">
              {c.text("Book a Service", "احجز خدمة")}
              <ArrowRight size={15} aria-hidden="true" />
            </ActionLink>
          </div>
        </div>
      </section>
    </div>
  );
}
