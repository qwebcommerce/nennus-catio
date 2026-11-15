import type { ProductOffer, PromoCodeStatus } from "@nennus-catio/contracts";

type Text = (en: string, ar: string) => string;
type Locale = "en" | "ar";

/**
 * A list key for an offer or an applied promotion: the public shapes carry no id, and their lists never
 * reorder, so what they say is enough.
 */
export function offerKey(offer: { name: { en: string }; offer?: string; value?: number; code?: string | null; discount?: number; endsOn?: string | null }): string {
  return [offer.name.en, offer.offer, offer.value, offer.code, offer.discount, offer.endsOn].join("|");
}

/** QAR from dirhams, without needless decimals ("QAR 20", "QAR 42.30"): for offer labels. */
export function offerMoney(minor: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === "ar" ? "ar-QA" : "en-QA", {
    style: "currency",
    currency: "QAR",
    minimumFractionDigits: minor % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(minor / 100);
}

/** The offer in a few words: "15% off", "QAR 20 off", "QAR 45 a set", "Buy 2, get 1 free" (shop and admin). */
export function offerText(offer: Pick<ProductOffer, "offer" | "value" | "buyGet">, text: Text, locale: Locale): string {
  switch (offer.offer) {
    case "percent":
      return text(`${offer.value}% off`, `خصم ${offer.value}٪`);
    case "fixed":
      return text(`${offerMoney(offer.value, locale)} off`, `خصم ${offerMoney(offer.value, locale)}`);
    case "bundle_price":
      return text(`${offerMoney(offer.value, locale)} a set`, `${offerMoney(offer.value, locale)} للمجموعة`);
    case "buy_get": {
      const deal = offer.buyGet;
      if (!deal) return text("Buy and get", "اشترِ واحصل");
      return deal.percent === 100
        ? text(`Buy ${deal.buy}, get ${deal.get} free`, `اشترِ ${deal.buy} واحصل على ${deal.get} مجاناً`)
        : text(`Buy ${deal.buy}, get ${deal.get} at ${deal.percent}% off`, `اشترِ ${deal.buy} واحصل على ${deal.get} بخصم ${deal.percent}٪`);
    }
  }
}

/**
 * Who and when, for a shop label (11e): new customers, members, once per customer (2A), a minimum
 * spend, the last day. Empty when the offer is for everyone, always.
 */
export function offerConditions(
  offer: Pick<ProductOffer, "eligibility" | "perCustomerLimit" | "minSpend" | "endsOn">,
  text: Text,
  locale: Locale,
): string[] {
  const parts: string[] = [];
  if (offer.eligibility === "new") parts.push(text("New customers", "للعملاء الجدد"));
  if (offer.eligibility === "registered") parts.push(text("Members", "للأعضاء"));
  if (offer.perCustomerLimit === 1) parts.push(text("Once per customer", "مرة واحدة لكل عميل"));
  else if (offer.perCustomerLimit > 1) parts.push(text(`${offer.perCustomerLimit} times per customer`, `${offer.perCustomerLimit} مرات لكل عميل`));
  if (offer.minSpend > 0) parts.push(text(`Spend ${offerMoney(offer.minSpend, locale)}+`, `عند إنفاق ${offerMoney(offer.minSpend, locale)} أو أكثر`));
  if (offer.endsOn) {
    const day = new Intl.DateTimeFormat(locale === "ar" ? "ar-QA" : "en-GB", { timeZone: "Asia/Qatar", day: "numeric", month: "short" }).format(
      new Date(`${offer.endsOn}T12:00:00Z`),
    );
    parts.push(text(`Until ${day}`, `حتى ${day}`));
  }
  return parts;
}

/**
 * What a promo code's answer means, in each language (D207: the website words `codeStatus`). English uses
 * the server's sentence when there is one, as it names amounts (a minimum spend) and who a code is for;
 * Arabic words each status. `discount` is what the quote took off: an applied code can take nothing off
 * when the total is already at the QAR 1 floor.
 */
export function promoCodeText(
  answer: { status: PromoCodeStatus; message?: string },
  text: Text,
  what: "order" | "booking" = "order",
  discount?: number,
): string {
  const en = (fallback: string) => answer.message ?? fallback;
  switch (answer.status) {
    case "applied":
      return discount === 0
        ? text(
            en(`The code is applied, but ${what === "booking" ? "a booking" : "an order"} always costs at least QAR 1, so it takes nothing off.`),
            "تم تطبيق الرمز، لكن الحد الأدنى للمبلغ ريال قطري واحد، لذلك لا يخصم شيئاً.",
          )
        : text(en("The code is applied."), "تم تطبيق الرمز.");
    case "unknown":
      return text(en("We don't recognise this code. Please check it."), "لا نعرف هذا الرمز. يرجى التحقق منه.");
    case "switched_off":
      return text(en("This code is not active at the moment."), "هذا الرمز غير مفعّل حالياً.");
    case "not_started":
      return text(en("This code is not valid yet."), "هذا الرمز غير صالح بعد.");
    case "ended":
      return text(en("This code has expired."), "انتهت صلاحية هذا الرمز.");
    case "not_eligible":
      return text(en("This code is only for registered or new customers."), "هذا الرمز مخصص للعملاء المسجلين أو للعملاء الجدد فقط.");
    case "used_up":
      return text(en("This code has been used up."), "نفدت استخدامات هذا الرمز.");
    case "used_up_for_you":
      return text(en("You have already used this code."), "لقد استخدمت هذا الرمز من قبل.");
    case "min_spend":
      return what === "booking"
        ? text(en("This code is for higher-priced grooming packages."), "هذا الرمز مخصص لباقات عناية بسعر أعلى.")
        : text(en("Spend a little more on items to use this code."), "أنفق مبلغاً أكبر على المنتجات لاستخدام هذا الرمز.");
    case "no_matching_items":
      return what === "booking"
        ? text(
            en("This code does not apply to this grooming package, or the package already has an offer."),
            "لا ينطبق هذا الرمز على باقة العناية هذه، أو أن للباقة عرضاً بالفعل.",
          )
        : text(en("This code does not apply to the items in your cart."), "لا ينطبق هذا الرمز على المنتجات في سلتك.");
  }
}
