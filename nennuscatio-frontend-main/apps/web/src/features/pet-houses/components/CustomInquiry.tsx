"use client";
import { MessageCircle, ArrowUpRight } from "lucide-react";
import { usePublicSettings } from "@/shared/api/use-public-settings";
import { useCopy } from "@/shared/lib/copy";
import { whatsappLink } from "../lib/whatsapp";

/**
 * WhatsApp about a Pet House (D68: custom houses and questions stay on WhatsApp, nothing is recorded).
 * `mode`: "custom" a custom version or a custom house; "quote" the price of a "price on request" model;
 * "ask" a model that cannot be ordered online yet (#14). `subtle`: a link under "Add to cart" instead
 * of the page's main button.
 */
export function CustomInquiry({
  model,
  mode = "custom",
  subtle = false,
}: {
  model?: string;
  mode?: "custom" | "quote" | "ask";
  subtle?: boolean;
}) {
  const c = useCopy(),
    { status, settings } = usePublicSettings();
  const message = model
    ? mode === "quote"
      ? c.text(`Hi Nennus Catio, I'd like to discuss the price for ${model}.`, `مرحباً Nennus Catio، أود مناقشة سعر ${model}.`)
      : mode === "ask"
        ? c.text(`Hi Nennus Catio, I'd like to ask about ${model}.`, `مرحباً Nennus Catio، أود الاستفسار عن ${model}.`)
        : c.text(`Hi Nennus Catio, I'd like to discuss a custom version of ${model}.`, `مرحباً Nennus Catio، أود مناقشة تصميم مخصص من ${model}.`)
    : c.text("Hi Nennus Catio, I'd like to discuss a custom pet house.", "مرحباً Nennus Catio، أود مناقشة بيت مخصص لحيواني.");
  const url = whatsappLink(settings?.socialLinks.whatsapp ?? "", message);
  const label =
    mode === "quote"
      ? c.text("Ask for a price on WhatsApp", "استفسر عن السعر عبر واتساب")
      : mode === "ask"
        ? c.text("Ask about it on WhatsApp", "استفسر عنه عبر واتساب")
        : subtle
          ? c.text("Discuss a custom design on WhatsApp", "ناقش تصميماً مخصصاً عبر واتساب")
          : c.text("Discuss a custom design", "ناقش تصميماً مخصصاً");
  const pendingNote =
    status === "loading"
      ? c.text("Loading the business contact…", "جارٍ تحميل جهة اتصال العمل…")
      : status === "error"
        ? c.text("The business contact could not be loaded right now.", "تعذّر تحميل جهة اتصال العمل حالياً.")
        : c.text(
            "Custom inquiries will open WhatsApp once the business contact is added by administration.",
            "ستُفتح الاستفسارات المخصصة عبر واتساب بعد إضافة رابط العمل من الإدارة.",
          );
  if (subtle) {
    // Under "Add to cart": a quiet offer, never a second main button.
    return url ? (
      <p className="house-inquiry house-inquiry--subtle small">
        {c.text("Want it in another size or colour? ", "تريده بمقاس أو لون آخر؟ ")}
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-link">
          {label}
          <ArrowUpRight size={14} className="directional" aria-hidden="true" />
          <span className="sr-only">{c.text("Opens WhatsApp in a new tab", "يفتح واتساب في نافذة جديدة")}</span>
        </a>
      </p>
    ) : null;
  }
  return (
    <div className="house-inquiry">
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className="button button--primary">
          <MessageCircle size={18} />
          {label}
          <ArrowUpRight size={16} />
          <span className="sr-only">{c.text("Opens WhatsApp in a new tab", "يفتح واتساب في نافذة جديدة")}</span>
        </a>
      ) : (
        <p className="note-box">
          <MessageCircle size={18} />
          {pendingNote}
        </p>
      )}
      <p className="small muted">
        {c.text(
          "Discuss the design directly with the team. Opening WhatsApp does not create an order or send a message.",
          "ناقش التصميم مباشرة مع الفريق. فتح واتساب لا ينشئ طلباً ولا يرسل رسالة.",
        )}
      </p>
    </div>
  );
}
