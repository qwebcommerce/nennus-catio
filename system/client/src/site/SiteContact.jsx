import React, { useState } from "react";
import { ArrowRight, Camera, MessageCircle, Phone } from "lucide-react";
import { useCopy, useShopMeta, waLink } from "./copy.js";

export function SiteContact() {
  const { text } = useCopy();
  const { business, status } = useShopMeta();
  const [sent, setSent] = useState(false);
  const whatsapp = waLink(business?.whatsapp);
  const pending = status === "loading"
    ? text("Loading…", "جارٍ التحميل…")
    : status === "error"
      ? text("Unavailable right now", "غير متاح حالياً")
      : text("Link coming soon", "الرابط قريباً");

  function submit(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const message = [
      data.get("fullName"),
      data.get("email"),
      `${data.get("countryCode") || ""} ${data.get("phone") || ""}`.trim(),
      data.get("subject"),
      data.get("reference"),
      data.get("message"),
    ].filter(Boolean).join("\n");
    const href = waLink(business?.whatsapp, message) || (business?.email ? `mailto:${business.email}?body=${encodeURIComponent(message)}` : "");
    if (href) window.open(href, "_blank", "noopener,noreferrer");
    setSent(true);
  }

  return (
    <div className="contact-page">
      <section className="contact-hero" aria-labelledby="contact-heading">
        <img className="contact-hero__photo" src="/images/reference-refresh/contact-hero.png" alt={text("A relaxed fluffy cat enjoying gentle attention from its owner", "قطة مسترخية تستمتع برعاية لطيفة من صاحبتها")} />
        <div className="contact-hero__copy">
          <p className="eyebrow">{text("CONTACT NENNUS CATIO", "تواصل مع Nennus Catio")}</p>
          <h1 id="contact-heading">{text("How can we help?", "كيف يمكننا مساعدتك؟")}</h1>
          <p>{text("Whether it’s an order, grooming appointment, pet house, or simply a question about your pet, we’re here for you.", "سواء كان استفسارك عن طلب أو موعد عناية أو بيت لحيوانك، أو مجرد سؤال عن حيوانك الأليف، نحن هنا لمساعدتك.")}</p>
          <a className="button button--primary contact-hero__button" href={whatsapp || "#contact-options"} {...(whatsapp ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
            <MessageCircle size={21} aria-hidden="true" />
            {text("Chat on WhatsApp", "تحدث معنا عبر واتساب")}
            <ArrowRight size={18} className="directional" aria-hidden="true" />
          </a>
        </div>
      </section>
      <div className="contact-grid">
        <section className="contact-card contact-options" id="contact-options" aria-labelledby="contact-options-heading">
          <h2 id="contact-options-heading">{text("We’d love to hear", "يسعدنا أن نسمع")}<br />{text("from you.", "منك.")}</h2>
          <p className="contact-options__intro">{text("Have a question or need a little help? Call us, or reach out through WhatsApp or the form, and our team will get back to you as soon as possible.", "هل لديك سؤال أو تحتاج إلى مساعدة؟ اتصل بنا، أو تواصل معنا عبر واتساب أو النموذج، وسيعود إليك فريقنا في أقرب وقت ممكن.")}</p>
          {whatsapp ? (
            <a className="contact-whatsapp" href={whatsapp} target="_blank" rel="noopener noreferrer">
              <span className="contact-whatsapp__icon"><MessageCircle size={29} aria-hidden="true" /></span>
              <span>
                <strong>{text("WhatsApp", "واتساب")}</strong>
                <small><bdi dir="ltr">{business.whatsapp}</bdi> · {text("Fastest way to reach us", "أسرع طريقة للتواصل معنا")}</small>
              </span>
              <ArrowRight size={24} className="directional" aria-hidden="true" />
            </a>
          ) : (
            <div className="contact-whatsapp contact-whatsapp--pending">
              <span className="contact-whatsapp__icon"><MessageCircle size={29} aria-hidden="true" /></span>
              <span><strong>{text("WhatsApp", "واتساب")}</strong><small>{pending}</small></span>
            </div>
          )}
          {business?.phone && (
            <a className="contact-whatsapp contact-call" href={`tel:${business.phone}`}>
              <span className="contact-whatsapp__icon"><Phone size={27} aria-hidden="true" /></span>
              <span><strong>{text("Call us", "اتصل بنا")}</strong><small><bdi dir="ltr">{business.phone}</bdi></small></span>
              <ArrowRight size={24} className="directional" aria-hidden="true" />
            </a>
          )}
          {business?.email && <p><a href={`mailto:${business.email}`}>{business.email}</a></p>}
          {business?.address && <p>{business.address}</p>}
          <section className="contact-instagram" aria-labelledby="contact-instagram-heading">
            <h3 id="contact-instagram-heading">{text("Follow us on Instagram", "تابعنا على إنستغرام")}</h3>
            <div className="contact-instagram__accounts">
              {[
                text("Products & essentials", "المنتجات والمستلزمات"),
                text("Grooming", "العناية"),
                text("Pet houses & custom projects", "بيوت الحيوانات والمشاريع المخصصة"),
              ].map((label) => (
                <div className="contact-instagram__account" key={label}>
                  <span className="contact-instagram__pending"><Camera size={14} aria-hidden="true" />{pending}</span>
                  <p>{label}</p>
                </div>
              ))}
            </div>
          </section>
        </section>
        <section className="contact-card contact-message" aria-labelledby="contact-message-heading">
          <h2 id="contact-message-heading">{text("Send us a message", "أرسل لنا رسالة")}</h2>
          <form className="contact-form" onSubmit={submit}>
            <div className="contact-form__pair">
              <div className="contact-field">
                <label htmlFor="contact-name">{text("Name", "الاسم")}</label>
                <input id="contact-name" name="fullName" autoComplete="name" placeholder={text("Your name", "اسمك")} required maxLength={120} />
              </div>
              <div className="contact-field">
                <label htmlFor="contact-email">{text("Email Address", "البريد الإلكتروني")}</label>
                <input id="contact-email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required maxLength={254} dir="ltr" />
              </div>
            </div>
            <div className="contact-field">
              <label htmlFor="contact-phone">{text("Phone Number", "رقم الهاتف")}</label>
              <div className="contact-phone">
                <select name="countryCode" aria-label={text("Phone country code", "رمز الدولة للهاتف")} defaultValue="+974" dir="ltr">
                  {["+974", "+971", "+966", "+973", "+965", "+968", "+44", "+1"].map((code) => <option key={code} value={code}>{code}</option>)}
                </select>
                <input id="contact-phone" name="phone" autoComplete="tel-national" placeholder={text("Your phone number", "رقم هاتفك")} maxLength={24} dir="ltr" />
              </div>
            </div>
            <div className="contact-field">
              <label htmlFor="contact-subject">{text("What can we help with?", "كيف يمكننا مساعدتك؟")}</label>
              <select id="contact-subject" name="subject" required defaultValue="">
                <option value="" disabled>{text("Select an option", "اختر موضوعاً")}</option>
                <option value="Product order">{text("Product order", "طلب منتجات")}</option>
                <option value="Grooming appointment">{text("Grooming appointment", "موعد عناية")}</option>
                <option value="Pet house">{text("Pet house or custom design", "بيت حيوان أو تصميم مخصص")}</option>
                <option value="Pet relocation">{text("Pet relocation", "نقل الحيوانات")}</option>
                <option value="General enquiry">{text("General enquiry", "استفسار عام")}</option>
              </select>
            </div>
            <div className="contact-field">
              <label htmlFor="contact-message">{text("Message", "الرسالة")}</label>
              <textarea id="contact-message" name="message" required maxLength={2000} placeholder={text("How can we help?", "كيف يمكننا مساعدتك؟")} />
            </div>
            <button className="button button--primary" type="submit">{text("Send message", "أرسل الرسالة")}<ArrowRight size={16} className="directional" /></button>
            {sent && <p role="status">{text("Your message is ready in WhatsApp or email. Send it there to reach the team.", "رسالتك جاهزة في واتساب أو البريد. أرسلها من هناك ليصلك الفريق.")}</p>}
          </form>
        </section>
      </div>
    </div>
  );
}
