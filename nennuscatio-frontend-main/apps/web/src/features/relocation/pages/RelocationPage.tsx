"use client";

import { ArrowRight, HeartHandshake, MessageCircle, ShieldCheck, Truck } from "lucide-react";
import { whatsappLink } from "@/features/pet-houses/lib/whatsapp";
import { Link } from "@/i18n/navigation";
import { assets } from "@/mocks/data/assets";
import { usePublicSettings } from "@/shared/api/use-public-settings";
import { useCopy } from "@/shared/lib/copy";
import { Photo } from "@/shared/ui/Photo";

/**
 * The relocation information page (D35): no price, booking or route is promised here. Since 15c it starts
 * a relocation request (an account is required, D279) beside the WhatsApp inquiry (answer 15).
 */
export function RelocationPage() {
  const c = useCopy();
  const { status, settings } = usePublicSettings();
  const url = whatsappLink(
    settings?.socialLinks.whatsapp ?? "",
    c.text(
      "Hi Nennus Catio, I'd like to ask about pet relocation. Please tell me what details you need.",
      "مرحباً Nennus Catio، أود الاستفسار عن نقل الحيوانات. ما المعلومات التي تحتاجونها؟",
    ),
  );
  return (
    <div className="ref-relocation">
      <section className="ref-page-hero ref-page-hero--relocation">
        <Photo src={assets.relocationHero} alt={c.text("A dog and cat beside a pet travel carrier", "كلب وقطة بجانب حقيبة نقل الحيوانات")} priority sizes="100vw" />
        <div>
          <p className="eyebrow">{c.text("RELOCATION · ENQUIRIES", "نقل الحيوانات · استفسارات")}</p>
          <h1>{c.text("A new place, with care at every step.", "مكان جديد، ورعاية في كل خطوة.")}</h1>
          <p>{c.text("Tell the team what you have in mind. We will discuss your pet and journey directly before any service is confirmed.", "أخبر الفريق بما تحتاجه. ستناقشون تفاصيل حيوانك ورحلته مباشرة قبل تأكيد أي خدمة.")}</p>
          <div className="ref-hero__actions">
            <Link href="/relocation/request" className="button button--primary ref-pill-button">{c.text("Start a relocation request", "ابدأ طلب نقل")}<ArrowRight size={17} className="directional" /></Link>
            {url ? <a href={url} target="_blank" rel="noopener noreferrer" className="button button--secondary ref-pill-button"><MessageCircle size={18} />{c.text("Ask on WhatsApp", "استفسر عبر واتساب")}</a> : <a href="#relocation-contact" className="button button--secondary ref-pill-button">{c.text("How to enquire", "طريقة الاستفسار")}</a>}
          </div>
        </div>
      </section>
      <div className="ref-feature-strip">
        <div><HeartHandshake size={23} /><span>{c.text("Start with your pet's needs", "ابدأ باحتياجات حيوانك")}</span></div>
        <div><Truck size={23} /><span>{c.text("Discuss the journey", "ناقش تفاصيل الرحلة")}</span></div>
        <div><ShieldCheck size={23} /><span>{c.text("Confirm details with the team", "أكد التفاصيل مع الفريق")}</span></div>
      </div>
      <section className="ref-section ref-relocation__content" id="relocation-contact">
        <div>
          <p className="eyebrow">{c.text("HOW TO GET STARTED", "كيف تبدأ")}</p>
          <h2>{c.text("Every journey begins with a conversation.", "كل رحلة تبدأ بمحادثة.")}</h2>
          <p>{c.text("Relocation requirements depend on your pet and destination. This prototype does not offer an instant price, booking or guaranteed route.", "تعتمد متطلبات النقل على حيوانك والوجهة. لا تقدم هذه المعاينة سعراً فورياً أو حجزاً أو مساراً مضموناً.")}</p>
        </div>
        <div className="ref-relocation__steps">
          <div><span>01</span><strong>{c.text("Tell us about your pet", "أخبرنا عن حيوانك")}</strong><p>{c.text("Share the pet type and any needs with the team.", "شارك نوع الحيوان واحتياجاته مع الفريق.")}</p></div>
          <div><span>02</span><strong>{c.text("Describe the journey", "اشرح تفاصيل الرحلة")}</strong><p>{c.text("Discuss your intended origin, destination and dates.", "ناقش نقطة الانطلاق والوجهة والتواريخ المقترحة.")}</p></div>
          <div><span>03</span><strong>{c.text("Review next steps together", "راجع الخطوات التالية")}</strong><p>{c.text("The team will confirm availability, requirements and any quotation directly.", "سيؤكد الفريق التوفر والمتطلبات وأي عرض سعر مباشرة.")}</p></div>
        </div>
      </section>
      <section className="ref-relocation__contact">
        <MessageCircle size={29} aria-hidden="true" />
        <div><h2>{c.text("Have a move in mind?", "هل تخطط للانتقال؟")}</h2><p>{c.text("Ask the Nennus Catio team about the right next step for your pet.", "استفسر من فريق Nennus Catio عن الخطوة المناسبة لحيوانك.")}</p></div>
        <div className="ref-relocation__actions">
          <Link href="/relocation/request" className="button button--primary ref-pill-button">{c.text("Start a request", "ابدأ طلباً")}<ArrowRight size={16} className="directional" /></Link>
          {url ? <a href={url} target="_blank" rel="noopener noreferrer" className="button button--secondary ref-pill-button">{c.text("Open WhatsApp", "افتح واتساب")}<ArrowRight size={16} className="directional" /></a> : <p className="ref-relocation__pending" role="status">{status === "loading" ? c.text("Loading the business contact…", "جارٍ تحميل جهة اتصال العمل…") : status === "error" ? c.text("The business contact could not be loaded right now.", "تعذّر تحميل جهة اتصال العمل حالياً.") : c.text("WhatsApp contact will appear once the owner adds the business number in Settings.", "سيظهر رابط واتساب بعد إضافة رقم العمل في الإعدادات.")}</p>}
        </div>
      </section>
    </div>
  );
}
