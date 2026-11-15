"use client";

import { useState, type FormEvent } from "react";
import { formatPhone } from "@nennus-catio/contracts";
import { ArrowRight, Camera, CheckCircle2, MessageCircle, Phone } from "lucide-react";
import { whatsappLink } from "@/features/pet-houses/lib/whatsapp";
import { assets } from "@/mocks/data/assets";
import { usePublicSettings } from "@/shared/api/use-public-settings";
import { useCopy } from "@/shared/lib/copy";
import { Photo } from "@/shared/ui/Photo";
import { NumberInput } from "@/shared/ui/NumberInput";

function instagramAccount(value: string) {
  try {
    const url = new URL(value);
    const handle = url.pathname.split("/").filter(Boolean)[0];
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      !["instagram.com", "www.instagram.com"].includes(url.hostname) ||
      !handle ||
      !/^[a-zA-Z0-9_.]{1,30}$/.test(handle) ||
      ["p", "reel", "reels", "stories", "explore", "accounts"].includes(handle)
    )
      return null;
    return {
      href: `https://www.instagram.com/${handle}/`,
      handle: `@${handle}`,
    };
  } catch {
    return null;
  }
}

/** Local form preview only. Customer messages are not stored or transmitted. */
export function ContactPage() {
  const c = useCopy();
  const { status, settings } = usePublicSettings();
  const [previewComplete, setPreviewComplete] = useState(false);
  const links = settings?.socialLinks;
  const whatsapp = whatsappLink(links?.whatsapp ?? "");
  // whatsappLink always answers https://wa.me/<number>; the number is shown as people read it (D232).
  const whatsappNumber = whatsapp ? formatPhone(`+${new URL(whatsapp).pathname.slice(1)}`) : null;
  const phone = settings?.phone ?? null;
  // While settings load or fail, say so instead of claiming a link is "coming soon".
  const pendingLabel =
    status === "loading"
      ? c.text("Loading…", "جارٍ التحميل…")
      : status === "error"
        ? c.text("Unavailable right now", "غير متاح حالياً")
        : c.text("Link coming soon", "الرابط قريباً");
  const accounts = [
    {
      value: links?.instagram ?? "",
      label: c.text("Products & essentials", "المنتجات والمستلزمات"),
    },
    { value: links?.instagramGrooming ?? "", label: c.text("Grooming", "العناية") },
    {
      value: links?.instagramProjects ?? "",
      label: c.text(
        "Pet houses & custom projects",
        "بيوت الحيوانات والمشاريع المخصصة",
      ),
    },
  ];

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    for (const name of ["fullName", "message"]) {
      const field = form.elements.namedItem(name) as
        | HTMLInputElement
        | HTMLTextAreaElement;
      field.setCustomValidity(
        field.value.trim()
          ? ""
          : c.text("Please complete this field.", "يرجى ملء هذا الحقل."),
      );
    }
    if (!form.reportValidity()) return;
    setPreviewComplete(true);
  }

  const whatsappContent = (
    <>
      <span className="contact-whatsapp__icon">
        <MessageCircle size={29} aria-hidden="true" />
      </span>
      <span>
        <strong>{c.text("WhatsApp", "واتساب")}</strong>
        <small>
          {whatsappNumber
            ? (
                <>
                  <bdi dir="ltr">{whatsappNumber}</bdi>
                  {" · "}
                  {c.text("Fastest way to reach us", "أسرع طريقة للتواصل معنا")}
                </>
              )
            : status === "loading"
              ? c.text("Loading contact…", "جارٍ تحميل جهة الاتصال…")
              : status === "error"
                ? c.text("Contact unavailable right now", "جهة الاتصال غير متاحة حالياً")
                : c.text("Business number coming soon", "رقم التواصل قريباً")}
        </small>
      </span>
      <ArrowRight size={24} className="directional" aria-hidden="true" />
    </>
  );

  return (
    <div className="contact-page">
      <section className="contact-hero" aria-labelledby="contact-heading">
        <Photo
          src={assets.contactHero}
          alt={c.text(
            "A relaxed fluffy cat enjoying gentle attention from its owner",
            "قطة مسترخية تستمتع برعاية لطيفة من صاحبتها",
          )}
          className="contact-hero__photo"
          priority
          sizes="(min-width: 1600px) 1600px, 100vw"
        />
        <div className="contact-hero__copy">
          <p className="eyebrow">
            {c.text("CONTACT NENNUS CATIO", "تواصل مع Nennus Catio")}
          </p>
          <h1 id="contact-heading">
            {c.text("How can we help?", "كيف يمكننا مساعدتك؟")}
          </h1>
          <p>
            {c.text(
              "Whether it’s an order, grooming appointment, pet house, or simply a question about your pet, we’re here for you.",
              "سواء كان استفسارك عن طلب أو موعد عناية أو بيت لحيوانك، أو مجرد سؤال عن حيوانك الأليف، نحن هنا لمساعدتك.",
            )}
          </p>
          {whatsapp ? (
            <a
              className="button button--primary contact-hero__button"
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle size={21} aria-hidden="true" />
              {c.text("Chat on WhatsApp", "تحدث معنا عبر واتساب")}
              <ArrowRight
                size={18}
                className="directional"
                aria-hidden="true"
              />
            </a>
          ) : (
            <a
              className="button button--primary contact-hero__button"
              href="#contact-options"
            >
              <MessageCircle size={21} aria-hidden="true" />
              {c.text("Chat on WhatsApp", "تحدث معنا عبر واتساب")}
              <ArrowRight
                size={18}
                className="directional"
                aria-hidden="true"
              />
            </a>
          )}
        </div>
      </section>

      <div className="contact-grid">
        <section
          className="contact-card contact-options"
          id="contact-options"
          aria-labelledby="contact-options-heading"
        >
          <h2 id="contact-options-heading">
            {c.text("We’d love to hear", "يسعدنا أن نسمع")}
            <br />
            {c.text("from you.", "منك.")}
          </h2>
          <p className="contact-options__intro">
            {phone
              ? c.text(
                  "Have a question or need a little help? Call us, or reach out through WhatsApp, Instagram or the form, and our team will get back to you as soon as possible.",
                  "هل لديك سؤال أو تحتاج إلى مساعدة؟ اتصل بنا، أو تواصل معنا عبر واتساب أو إنستغرام أو النموذج، وسيعود إليك فريقنا في أقرب وقت ممكن.",
                )
              : c.text(
                  "Have a question or need a little help? Reach out to us through WhatsApp, Instagram or the form, and our team will get back to you as soon as possible.",
                  "هل لديك سؤال أو تحتاج إلى مساعدة؟ تواصل معنا عبر واتساب أو إنستغرام أو النموذج، وسيعود إليك فريقنا في أقرب وقت ممكن.",
                )}
          </p>
          {whatsapp ? (
            <a
              className="contact-whatsapp"
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
            >
              {whatsappContent}
            </a>
          ) : (
            <div className="contact-whatsapp contact-whatsapp--pending">
              {whatsappContent}
            </div>
          )}
          {/* The business phone, only once staff set one in Settings (D232). */}
          {phone && (
            <a className="contact-whatsapp contact-call" href={`tel:${phone}`}>
              <span className="contact-whatsapp__icon">
                <Phone size={27} aria-hidden="true" />
              </span>
              <span>
                <strong>{c.text("Call us", "اتصل بنا")}</strong>
                <small>
                  <bdi dir="ltr">{formatPhone(phone)}</bdi>
                </small>
              </span>
              <ArrowRight size={24} className="directional" aria-hidden="true" />
            </a>
          )}
          <section
            className="contact-instagram"
            aria-labelledby="contact-instagram-heading"
          >
            <h3 id="contact-instagram-heading">
              {c.text("Follow us on Instagram", "تابعنا على إنستغرام")}
            </h3>
            <div className="contact-instagram__accounts">
              {accounts.map((account) => {
                const link = instagramAccount(account.value);
                return (
                  <div
                    className="contact-instagram__account"
                    key={account.label}
                  >
                    {link ? (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <bdi dir="ltr">{link.handle}</bdi>
                      </a>
                    ) : (
                      <span className="contact-instagram__pending">
                        <Camera size={14} aria-hidden="true" />
                        {pendingLabel}
                      </span>
                    )}
                    <p>{account.label}</p>
                  </div>
                );
              })}
            </div>
          </section>
        </section>

        <section
          className="contact-card contact-message"
          aria-labelledby="contact-message-heading"
        >
          <h2 id="contact-message-heading">
            {c.text("Send us a message", "أرسل لنا رسالة")}
          </h2>
          <form
            className="contact-form"
            onSubmit={submit}
            aria-describedby="contact-form-note"
            onInput={(event) => {
              setPreviewComplete(false);
              const field = event.target;
              if (
                field instanceof HTMLInputElement ||
                field instanceof HTMLTextAreaElement
              )
                field.setCustomValidity("");
            }}
          >
            <div className="contact-form__pair">
              <div className="contact-field">
                <label htmlFor="contact-name">
                  {c.text("Name", "الاسم")}{" "}
                  <span className="contact-required" aria-hidden="true">
                    *
                  </span>
                </label>
                <input
                  id="contact-name"
                  name="fullName"
                  autoComplete="name"
                  placeholder={c.text("Your name", "اسمك")}
                  required
                  maxLength={120}
                />
              </div>
              <div className="contact-field">
                <label htmlFor="contact-email">
                  {c.text("Email Address", "البريد الإلكتروني")}{" "}
                  <span className="contact-required" aria-hidden="true">
                    *
                  </span>
                </label>
                <input
                  id="contact-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  required
                  maxLength={254}
                  dir="ltr"
                />
              </div>
            </div>
            <div className="contact-field">
              <label htmlFor="contact-phone">
                {c.text("Phone Number", "رقم الهاتف")}{" "}
                <span>{c.text("(optional)", "(اختياري)")}</span>
              </label>
              <div className="contact-phone">
                <select
                  name="countryCode"
                  aria-label={c.text("Phone country code", "رمز الدولة للهاتف")}
                  defaultValue="+974"
                  dir="ltr"
                >
                  {[
                    "+974",
                    "+971",
                    "+966",
                    "+973",
                    "+965",
                    "+968",
                    "+63",
                    "+91",
                    "+44",
                    "+1",
                  ].map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
                <NumberInput
                  kind="phone"
                  id="contact-phone"
                  name="phone"
                  autoComplete="tel-national"
                  placeholder={c.text("Your phone number", "رقم هاتفك")}
                  pattern="[0-9 ]{5,24}"
                  title={c.text(
                    "Use 5–24 digits and spaces.",
                    "استخدم من ٥ إلى ٢٤ رقماً ومسافة.",
                  )}
                  maxLength={24}
                  dir="ltr"
                />
              </div>
            </div>
            <div className="contact-field">
              <label htmlFor="contact-subject">
                {c.text("What can we help with?", "كيف يمكننا مساعدتك؟")}{" "}
                <span className="contact-required" aria-hidden="true">
                  *
                </span>
              </label>
              <select
                id="contact-subject"
                name="subject"
                required
                defaultValue=""
              >
                <option value="" disabled>
                  {c.text("Select an option", "اختر موضوعاً")}
                </option>
                <option value="order">
                  {c.text("Product order", "طلب منتجات")}
                </option>
                <option value="grooming">
                  {c.text("Grooming appointment", "موعد عناية")}
                </option>
                <option value="pet-house">
                  {c.text(
                    "Pet house or custom design",
                    "بيت حيوان أو تصميم مخصص",
                  )}
                </option>
                <option value="relocation">
                  {c.text("Pet relocation", "نقل الحيوانات")}
                </option>
                <option value="general">
                  {c.text("General enquiry", "استفسار عام")}
                </option>
              </select>
            </div>
            <div className="contact-field">
              <label htmlFor="contact-reference">
                {c.text("Order or Booking Number", "رقم الطلب أو الحجز")}{" "}
                <span>{c.text("(optional)", "(اختياري)")}</span>
              </label>
              <input
                id="contact-reference"
                name="reference"
                placeholder={c.text("e.g. #12345", "مثلاً #12345")}
                maxLength={80}
                dir="ltr"
              />
            </div>
            <div className="contact-field">
              <label htmlFor="contact-message">
                {c.text("Message", "الرسالة")}{" "}
                <span className="contact-required" aria-hidden="true">
                  *
                </span>
              </label>
              <textarea
                id="contact-message"
                name="message"
                placeholder={c.text(
                  "Tell us how we can help…",
                  "أخبرنا كيف يمكننا مساعدتك…",
                )}
                required
                maxLength={3000}
                rows={4}
              />
            </div>
            <button
              type="submit"
              className="button button--primary contact-form__submit"
            >
              {c.text("Send Message", "إرسال الرسالة")}
              <ArrowRight
                size={19}
                className="directional"
                aria-hidden="true"
              />
            </button>
            <p className="contact-form__note" id="contact-form-note">
              {c.text(
                "Preview form · messages are not sent or saved yet.",
                "نموذج للمعاينة · لا يتم إرسال الرسائل أو حفظها حالياً.",
              )}
            </p>
            {previewComplete && (
              <div className="contact-form__result" role="status">
                <CheckCircle2 size={19} aria-hidden="true" />
                <p>
                  {c.text(
                    "Your message preview is complete. Nothing was sent or saved. Please use an available contact link to reach the team.",
                    "اكتملت معاينة رسالتك. لم يتم إرسالها أو حفظها. يرجى استخدام رابط تواصل متاح للوصول إلى الفريق.",
                  )}
                </p>
              </div>
            )}
          </form>
        </section>
      </div>
    </div>
  );
}
