import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, HeartHandshake, MessageCircle, ShieldCheck, Truck } from "lucide-react";
import { useCopy, useShopMeta, waLink } from "./copy.js";

export function SiteRelocation() {
  const { text } = useCopy();
  const { business, status } = useShopMeta();
  const url = waLink(
    business?.whatsapp,
    text(
      "Hi Nennus Catio, I'd like to ask about pet relocation. Please tell me what details you need.",
      "مرحباً Nennus Catio، أود الاستفسار عن نقل الحيوانات. ما المعلومات التي تحتاجونها؟",
    ),
  );
  return (
    <div className="ref-relocation">
      <section className="ref-page-hero ref-page-hero--relocation">
        <img src="/images/reference-refresh/relocation-hero.png" alt={text("A dog and cat beside a pet travel carrier", "كلب وقطة بجانب حقيبة نقل الحيوانات")} />
        <div>
          <p className="eyebrow">{text("RELOCATION · ENQUIRIES", "نقل الحيوانات · استفسارات")}</p>
          <h1>{text("A new place, with care at every step.", "مكان جديد، ورعاية في كل خطوة.")}</h1>
          <p>{text("Tell the team what you have in mind. We will discuss your pet and journey directly before any service is confirmed.", "أخبر الفريق بما تحتاجه. ستناقشون تفاصيل حيوانك ورحلته مباشرة قبل تأكيد أي خدمة.")}</p>
          <div className="ref-hero__actions">
            <Link to="/shop/relocation" className="button button--primary ref-pill-button">{text("Start a relocation request", "ابدأ طلب نقل")}<ArrowRight size={17} className="directional" /></Link>
            {url ? (
              <a href={url} target="_blank" rel="noopener noreferrer" className="button button--secondary ref-pill-button"><MessageCircle size={18} />{text("Ask on WhatsApp", "استفسر عبر واتساب")}</a>
            ) : (
              <a href="#relocation-contact" className="button button--secondary ref-pill-button">{text("How to enquire", "طريقة الاستفسار")}</a>
            )}
          </div>
        </div>
      </section>
      <div className="ref-feature-strip">
        <div><HeartHandshake size={23} /><span>{text("Start with your pet's needs", "ابدأ باحتياجات حيوانك")}</span></div>
        <div><Truck size={23} /><span>{text("Discuss the journey", "ناقش تفاصيل الرحلة")}</span></div>
        <div><ShieldCheck size={23} /><span>{text("Confirm details with the team", "أكد التفاصيل مع الفريق")}</span></div>
      </div>
      <section className="ref-section ref-relocation__content" id="relocation-contact">
        <div>
          <p className="eyebrow">{text("HOW TO GET STARTED", "كيف تبدأ")}</p>
          <h2>{text("Every journey begins with a conversation.", "كل رحلة تبدأ بمحادثة.")}</h2>
          <p>{text("Relocation requirements depend on your pet and destination. The team confirms the details with you before anything is booked.", "تعتمد متطلبات النقل على حيوانك والوجهة. يؤكد الفريق التفاصيل معك قبل أي حجز.")}</p>
        </div>
        <div className="ref-relocation__steps">
          <div><span>01</span><strong>{text("Tell us about your pet", "أخبرنا عن حيوانك")}</strong><p>{text("Share the pet type and any needs with the team.", "شارك نوع الحيوان واحتياجاته مع الفريق.")}</p></div>
          <div><span>02</span><strong>{text("Describe the journey", "اشرح تفاصيل الرحلة")}</strong><p>{text("Discuss your intended origin, destination and dates.", "ناقش نقطة الانطلاق والوجهة والتواريخ المقترحة.")}</p></div>
          <div><span>03</span><strong>{text("Review next steps together", "راجع الخطوات التالية")}</strong><p>{text("The team will confirm availability, requirements and any quotation directly.", "سيؤكد الفريق التوفر والمتطلبات وأي عرض سعر مباشرة.")}</p></div>
        </div>
      </section>
      <section className="ref-relocation__contact">
        <MessageCircle size={29} aria-hidden="true" />
        <div>
          <h2>{text("Have a move in mind?", "هل تخطط للانتقال؟")}</h2>
          <p>{text("Ask the Nennus Catio team about the right next step for your pet.", "استفسر من فريق Nennus Catio عن الخطوة المناسبة لحيوانك.")}</p>
        </div>
        <div className="ref-relocation__actions">
          <Link to="/shop/relocation" className="button button--primary ref-pill-button">{text("Start a request", "ابدأ طلباً")}<ArrowRight size={16} className="directional" /></Link>
          {url ? (
            <a href={url} target="_blank" rel="noopener noreferrer" className="button button--secondary ref-pill-button">{text("Open WhatsApp", "افتح واتساب")}<ArrowRight size={16} className="directional" /></a>
          ) : (
            <p className="ref-relocation__pending" role="status">
              {status === "loading"
                ? text("Loading the business contact…", "جارٍ تحميل جهة اتصال العمل…")
                : text("WhatsApp will appear once the business number is added in settings.", "سيظهر واتساب بعد إضافة رقم العمل في الإعدادات.")}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
