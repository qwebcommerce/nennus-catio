/** Customer and staff email copy in English and Arabic (FR-85, NFR-01). */

const STATUS = {
  en: {
    PENDING_PAYMENT: "awaiting payment",
    CONFIRMED: "confirmed",
    PREPARING: "being prepared",
    OUT_FOR_DELIVERY: "out for delivery",
    READY_FOR_PICKUP: "ready for pickup",
    DELIVERED: "delivered",
    COLLECTED: "collected",
    CANCELLED: "cancelled",
    BOOKED: "booked",
    CHECKED_IN: "checked in",
    IN_PROGRESS: "in progress",
    DONE: "done",
    NO_SHOW: "marked as a no-show",
    SUBMITTED: "submitted",
    DOCUMENTS_REQUESTED: "waiting for documents",
    DOCUMENTS_RECEIVED: "documents received",
    UNDER_REVIEW: "under review",
    QUOTE_SENT: "quoted",
    PAID: "paid",
    COMPLETED: "completed",
    RESCHEDULED: "rescheduled",
  },
  ar: {
    PENDING_PAYMENT: "بانتظار الدفع",
    CONFIRMED: "مؤكد",
    PREPARING: "قيد التجهيز",
    OUT_FOR_DELIVERY: "خرج للتوصيل",
    READY_FOR_PICKUP: "جاهز للاستلام",
    DELIVERED: "تم التوصيل",
    COLLECTED: "تم الاستلام",
    CANCELLED: "ملغى",
    BOOKED: "محجوز",
    CHECKED_IN: "تم تسجيل الوصول",
    IN_PROGRESS: "قيد التنفيذ",
    DONE: "منجز",
    NO_SHOW: "لم يحضر",
    SUBMITTED: "مُرسل",
    DOCUMENTS_REQUESTED: "بانتظار المستندات",
    DOCUMENTS_RECEIVED: "تم استلام المستندات",
    UNDER_REVIEW: "قيد المراجعة",
    QUOTE_SENT: "تم إرسال عرض السعر",
    PAID: "مدفوع",
    COMPLETED: "مكتمل",
    RESCHEDULED: "تمت إعادة جدولته",
  },
};

function status(lang, value) {
  return STATUS[lang][value] || STATUS.en[value] || String(value || "").toLowerCase().replace(/_/g, " ");
}

function amount(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : String(value ?? "");
}

/** Qatar date and time in the customer's language. */
function when(value, lang) {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat(lang === "ar" ? "ar-QA" : "en-GB", {
      timeZone: "Asia/Qatar",
      dateStyle: "full",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return new Date(value).toISOString();
  }
}

const SIGN = { en: "\n\nNennus Catio", ar: "\n\nنينوس كاتيو" };

const TEMPLATES = {
  verify: {
    en: (d) => ({ subject: "Confirm your Nennus Catio account", text: `Hello ${d.name || ""},\n\nConfirm your account by opening this link:\n${d.link}` }),
    ar: (d) => ({ subject: "تأكيد حسابك في نينوس كاتيو", text: `مرحباً ${d.name || ""}،\n\nأكّد حسابك بفتح هذا الرابط:\n${d.link}` }),
  },
  reset: {
    en: (d) => ({ subject: "Reset your Nennus Catio password", text: `Open this link to choose a new password (valid for one hour):\n${d.link}\n\nIf you did not ask for this, ignore this email.` }),
    ar: (d) => ({ subject: "إعادة تعيين كلمة المرور في نينوس كاتيو", text: `افتح هذا الرابط لاختيار كلمة مرور جديدة (صالح لمدة ساعة):\n${d.link}\n\nإذا لم تطلب ذلك فتجاهل هذه الرسالة.` }),
  },
  order: {
    en: (d) => ({ subject: `Your order ${d.reference} is ${status("en", d.status)}`, text: `Your Nennus Catio order ${d.reference} is now ${status("en", d.status)}.${d.link ? `\n\nView your order: ${d.link}` : ""}` }),
    ar: (d) => ({ subject: `طلبك ${d.reference}: ${status("ar", d.status)}`, text: `حالة طلبك ${d.reference} من نينوس كاتيو الآن: ${status("ar", d.status)}.${d.link ? `\n\nعرض الطلب: ${d.link}` : ""}` }),
  },
  refund: {
    en: (d) => ({ subject: `Your refund for ${d.reference}`, text: `A refund of ${amount(d.amount)} QAR was made for ${d.reference}.${d.method ? ` It goes back by ${d.method}.` : ""}` }),
    ar: (d) => ({ subject: `استرداد المبلغ للطلب ${d.reference}`, text: `تم استرداد مبلغ ${amount(d.amount)} ر.ق للطلب ${d.reference}.` }),
  },
  booking: {
    en: (d) => ({ subject: `Your grooming booking is ${status("en", d.status)}`, text: `Your grooming booking ${d.reference}${d.service ? ` (${d.service})` : ""}${d.startAt ? ` on ${when(d.startAt, "en")}` : ""} is ${status("en", d.status)}.` }),
    ar: (d) => ({ subject: `حجز التجميل: ${status("ar", d.status)}`, text: `حجز التجميل ${d.reference}${d.service ? ` (${d.service})` : ""}${d.startAt ? ` بتاريخ ${when(d.startAt, "ar")}` : ""}: ${status("ar", d.status)}.` }),
  },
  relocation: {
    en: (d) => ({
      subject: `Your relocation request is ${status("en", d.status)}`,
      text: d.status === "QUOTE_SENT"
        ? `A quote of ${amount(d.amount)} QAR is ready for your relocation request ${d.reference}. Sign in to view and pay it.`
        : `Your relocation request ${d.reference} is now ${status("en", d.status)}.${d.note ? `\n\n${d.note}` : ""}`,
    }),
    ar: (d) => ({
      subject: `طلب نقل الحيوان: ${status("ar", d.status)}`,
      text: d.status === "QUOTE_SENT"
        ? `عرض سعر بقيمة ${amount(d.amount)} ر.ق جاهز لطلب النقل ${d.reference}. سجّل الدخول لعرضه ودفعه.`
        : `حالة طلب النقل ${d.reference} الآن: ${status("ar", d.status)}.${d.note ? `\n\n${d.note}` : ""}`,
    }),
  },
};

/** Staff alerts are sent in both languages (staff language is not stored per address). */
const ALERTS = {
  alertOrder: (d) => [`Website order ${d.reference} is paid.`, `تم دفع طلب الموقع ${d.reference}.`],
  alertBooking: (d) => [`Grooming booking ${d.reference} is paid.`, `تم دفع حجز التجميل ${d.reference}.`],
  alertRelocation: (d) => [`Relocation request ${d.reference} was submitted.`, `تم إرسال طلب نقل ${d.reference}.`],
  alertLowStock: (d) => [
    `Stock is at or below its low-stock level for ${d.count} item(s)${d.names ? `: ${d.names}` : ""}.`,
    `المخزون عند حد التنبيه أو أقل لعدد ${d.count} صنف${d.names ? `: ${d.names}` : ""}.`,
  ],
};

export function customerLang(customer) {
  return customer?.locale === "en" ? "en" : "ar";
}

/** Renders a customer email. `data` may be a legacy plain string. */
export function renderCustomerEmail(kind, lang, data) {
  const template = TEMPLATES[kind]?.[lang];
  if (!template || typeof data === "string") {
    const subject = TEMPLATES[kind]?.[lang]?.({ reference: "", status: "" }).subject || (lang === "ar" ? "رسالة من نينوس كاتيو" : "Message from Nennus Catio");
    return { subject, text: `${String(data ?? "")}${SIGN[lang]}` };
  }
  const out = template(data || {});
  return { subject: out.subject, text: `${out.text}${SIGN[lang]}` };
}

export function renderStaffAlert(flag, data) {
  const make = ALERTS[flag];
  if (!make || typeof data === "string") return { subject: "Nennus Catio alert | تنبيه نينوس كاتيو", text: String(data ?? "") };
  const [en, ar] = make(data || {});
  return { subject: `Nennus Catio alert | تنبيه نينوس كاتيو`, text: `${en}\n\n${ar}` };
}
