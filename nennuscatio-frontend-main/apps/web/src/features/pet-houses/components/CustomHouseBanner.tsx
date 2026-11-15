"use client";
import { ArrowRight } from "lucide-react";
import { assets } from "@/mocks/data/assets";
import { usePublicSettings } from "@/shared/api/use-public-settings";
import { useCopy } from "@/shared/lib/copy";
import { Photo } from "@/shared/ui/Photo";
import { whatsappLink } from "../lib/whatsapp";

export function CustomHouseBanner() {
  const c = useCopy();
  const { status, settings } = usePublicSettings();
  const url = whatsappLink(
    settings?.socialLinks.whatsapp ?? "",
    c.text(
      "Hi Nennus Catio, I'd like to discuss a custom pet house.",
      "مرحباً Nennus Catio، أود مناقشة تصميم بيت مخصص لحيواني الأليف.",
    ),
  );
  const label = c.text("Design a Custom House", "صمّم بيتاً مخصصاً");
  const contactNote =
    status === "loading"
      ? c.text("Loading contact…", "جارٍ تحميل جهة الاتصال…")
      : status === "error"
        ? c.text("Contact unavailable right now", "جهة الاتصال غير متاحة حالياً")
        : c.text("WhatsApp contact pending", "بانتظار إضافة جهة اتصال واتساب");
  return (
    <section className="ref-custom-house-banner" id="house-custom" aria-labelledby="house-custom-title">
      <Photo src={assets.customHouseBanner} alt={c.text("A cat relaxing in a woven pet house", "قطة تستريح داخل بيت من الخوص")} sizes="(max-width: 600px) 100vw, 62vw" />
      <div className="ref-custom-house-banner__copy">
        <p className="eyebrow">{c.text("CUSTOM PET HOUSES", "بيوت مخصصة للحيوانات الأليفة")}</p>
        <h2 id="house-custom-title">{c.text("Their own space, your own idea.", "مساحة تخصّهم، وفكرة من إبداعك.")}</h2>
        <p className="ref-custom-house-banner__description">{c.text("From ready-made houses to custom designs, create a space that feels like home.", "من البيوت الجاهزة إلى التصاميم المخصصة، اصنع لهم مساحة تشعرهم بالراحة وكأنهم في بيتهم.")}</p>
        <div className="ref-custom-house-banner__actions">
          {url ? (
            <a href={url} target="_blank" rel="noopener noreferrer" className="button button--primary ref-pill-button">
              {label}<ArrowRight size={15} className="directional" />
              <span className="sr-only">{c.text("Opens WhatsApp in a new tab; no message is sent automatically.", "يفتح واتساب في نافذة جديدة؛ لا تُرسل أي رسالة تلقائياً.")}</span>
            </a>
          ) : (
            <>
              <button type="button" disabled className="button button--primary ref-pill-button" aria-describedby="house-custom-contact-note">
                {label}<ArrowRight size={15} className="directional" />
              </button>
              <span id="house-custom-contact-note" className="ref-custom-house-banner__contact-note">{contactNote}</span>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
