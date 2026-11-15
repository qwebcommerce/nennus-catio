"use client";

import { type CustomerRelocationRequest, formatPhone, PAYMENT_LIMITS, RELOCATION_LIMITS, type RelocationStatus } from "@nennus-catio/contracts";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { whatsappLink } from "@/features/pet-houses/lib/whatsapp";
import { Link } from "@/i18n/navigation";
import { ApiError } from "@/shared/api/client";
import { useRelocationPayNow } from "@/shared/api/payments";
import {
  RELOCATION_ATTENTION_MESSAGE,
  RELOCATION_STATUS_LABELS,
  RELOCATION_STATUS_TONE,
  relocationErrorMessage,
  takeHandedDocuments,
  useCancelRelocation,
  useDocumentUploads,
  useRelocationRequest,
} from "@/shared/api/relocation";
import { usePublicSettings } from "@/shared/api/use-public-settings";
import { useCopy } from "@/shared/lib/copy";
import { customerLoginHref } from "@/shared/lib/customer-login";
import { CHECK_FAST_MS, CHECK_PATIENCE_MS, CHECK_SLOW_MS, checkingPayment, DID_NOT_GO_THROUGH, OPEN_PAYMENT } from "@/shared/lib/payment-check";
import { ActionLink } from "@/shared/ui/ActionLink";
import { Empty, Field } from "@/shared/ui/BusinessUI";
import { RelocationDocuments } from "../components/RelocationDocuments";
import { dayText, petAgeText, weightText, whenText } from "../lib/format";

type Text = (en: string, ar: string) => string;

/** The status a quote takes payment in (15b), and the ones after it is paid. */
const PAYING: RelocationStatus = "quote_requested";
const PAID_STATUSES: readonly RelocationStatus[] = ["paid", "in_progress", "completed"];

const PAID_OUTSIDE_METHOD: Readonly<Record<"bank_transfer" | "cash" | "other", { en: string; ar: string }>> = {
  bank_transfer: { en: "by bank transfer", ar: "بتحويل بنكي" },
  cash: { en: "in cash", ar: "نقداً" },
  other: { en: "outside the website", ar: "خارج الموقع" },
};

function heading(status: RelocationStatus, checking: boolean, text: Text): string {
  switch (status) {
    case "submitted":
      return text("We received your request", "استلمنا طلبك");
    case "documents_requested":
      return text("We need some documents", "نحتاج إلى بعض المستندات");
    case "documents_received":
      return text("We have your documents", "استلمنا مستنداتك");
    case "under_review":
      return text("Your request is under review", "طلبك قيد المراجعة");
    case "quote_requested":
      return checking ? text("Checking your payment", "نتحقق من دفعتك") : text("Your quote is ready", "عرض السعر جاهز");
    case "paid":
      return text("Thank you, your payment is received", "شكراً، استلمنا دفعتك");
    case "in_progress":
      return text("Your pet's relocation is under way", "نقل حيوانك جارٍ");
    case "completed":
      return text("Relocation completed", "اكتمل النقل");
    case "cancelled":
      return text("This request is cancelled", "تم إلغاء هذا الطلب");
  }
}

/** What happens next, in one line; a cancelled request says why instead. */
function nextStep(status: RelocationStatus, text: Text): string | null {
  switch (status) {
    case "submitted":
      return text(
        "Our team will review your request and tell you here and by email if we need any documents.",
        "سيراجع فريقنا طلبك ويخبرك هنا وبالبريد إذا احتجنا إلى أي مستندات.",
      );
    case "documents_requested":
      return text("Please upload the documents marked below. Our team reviews each one.", "يرجى رفع المستندات المحددة أدناه. يراجع فريقنا كل مستند.");
    case "documents_received":
      return text("Thank you. Our team will review your documents and your request.", "شكراً لك. سيراجع فريقنا مستنداتك وطلبك.");
    case "under_review":
      return text("Our team is reviewing your request. You will receive a quote here and by email.", "يراجع فريقنا طلبك. ستصلك عرض سعر هنا وبالبريد.");
    case "quote_requested":
      return text("Pay the quote below to confirm the relocation.", "ادفع عرض السعر أدناه لتأكيد النقل.");
    case "paid":
      return text("Our team will contact you to arrange the next steps.", "سيتواصل معك فريقنا لترتيب الخطوات التالية.");
    case "in_progress":
      return text("We post updates below as the relocation goes on.", "ننشر التحديثات أدناه مع تقدم النقل.");
    case "completed":
      return text("Thank you for trusting us with your pet's journey.", "شكراً لثقتك بنا في رحلة حيوانك.");
    case "cancelled":
      return null;
  }
}

/**
 * One relocation request (15c; plan section 4.8), `/relocation/requests/<reference>`, for its owner only:
 * what happens next, the quote with Pay now (back from the payment page with `?payment=` it checks the
 * payment until our side knows the result), the documents with their uploads, the team's updates, the
 * timeline, the details, and Cancel request until the quote is paid (asks first).
 */
export function RelocationRequestDetailPage({ reference }: { reference: string }) {
  const c = useCopy();
  const [watching, setWatching] = useState<string | null>(null);
  const [checkingSince, setCheckingSince] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [unmatched, setUnmatched] = useState(0);
  useEffect(() => {
    setWatching(new URLSearchParams(window.location.search).get("payment"));
  }, []);
  const patient = checkingSince !== null && now - checkingSince >= CHECK_PATIENCE_MS;
  const request = useRelocationRequest(reference, (current) =>
    current && checkingPayment(current, watching, PAYING) ? (patient ? CHECK_SLOW_MS : CHECK_FAST_MS) : false,
  );
  const uploads = useDocumentUploads(reference);
  const cancel = useCancelRelocation(reference);
  const pay = useRelocationPayNow(reference);
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const checking = request.data ? checkingPayment(request.data, watching, PAYING) : false;
  useEffect(() => {
    setCheckingSince((since) => (checking ? (since ?? Date.now()) : null));
    if (!checking) return;
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, [checking]);

  // The files chosen in the form go out once the request has been read, so no older read lands after them.
  const settled = request.isSuccess && !request.isFetching;
  const { add } = uploads;
  useEffect(() => {
    if (!settled) return;
    const handed = takeHandedDocuments(reference);
    for (const item of handed.files) add(item.slotId, item.file);
    if (handed.unmatched > 0) setUnmatched(handed.unmatched);
  }, [settled, reference, add]);

  if (request.isPending) {
    return (
      <div className="customer-page">
        <p role="status" aria-busy="true" className="muted">
          {c.text("Loading your request…", "جارٍ تحميل طلبك…")}
        </p>
      </div>
    );
  }
  if (request.isError) {
    const error = request.error;
    if (error instanceof ApiError && error.code === "UNAUTHENTICATED") {
      return (
        <Empty>
          {c.text("Log in to see this relocation request.", "سجّل الدخول لعرض طلب النقل هذا.")}
          <ActionLink href={customerLoginHref(`/relocation/requests/${reference}`)}>{c.text("Log in", "تسجيل الدخول")}</ActionLink>
        </Empty>
      );
    }
    if (error instanceof ApiError && error.code === "NOT_FOUND") {
      return (
        <Empty>
          {c.text(
            "We could not find this relocation request. Please check that you are logged in with the account that sent it.",
            "لم نعثر على طلب النقل هذا. تأكد من تسجيل الدخول بالحساب الذي أرسله.",
          )}
          <ActionLink href="/account/relocation">{c.text("My relocation requests", "طلبات النقل")}</ActionLink>
        </Empty>
      );
    }
    return (
      <Empty>
        {relocationErrorMessage(error, c.text)}
        <button type="button" className="button button--secondary" onClick={() => void request.refetch()}>
          {c.text("Retry", "أعد المحاولة")}
        </button>
      </Empty>
    );
  }

  const data = request.data;
  const { latest, attention } = data.payment;
  const waiting = data.status === PAYING;
  const paymentOpen = latest !== null && OPEN_PAYMENT.includes(latest.status);
  // Only an attempt of this quote: a withdrawn quote's failed attempt is not this one's (15b counts per quote).
  const triedThisQuote = data.payment.attemptsLeft < PAYMENT_LIMITS.attemptsPerOrder;
  const didNotGoThrough = waiting && triedThisQuote && latest !== null && DID_NOT_GO_THROUGH.includes(latest.status);
  const actionError = cancel.error ?? pay.error;
  const refundLine =
    data.status === "cancelled" && data.refundNeeded
      ? attention === "paid_after_cancel"
        ? c.local(RELOCATION_ATTENTION_MESSAGE.paid_after_cancel)
        : c.text("We will refund your payment and let you know when it is done.", "سنعيد المبلغ المدفوع ونخبرك عند إتمام ذلك.")
      : null;
  const attentionLine = refundLine === null && attention ? c.local(RELOCATION_ATTENTION_MESSAGE[attention]) : null;
  const next = nextStep(data.status, c.text);
  const Icon = data.status === "cancelled" ? XCircle : data.status === "completed" || data.status === "paid" ? CheckCircle2 : Clock;

  function startPayment() {
    pay.mutate(undefined, {
      onError: (error) => {
        // Paid at the provider already, or the quote changed meanwhile: show what the server knows now.
        if (error instanceof ApiError && error.code === "PAYMENT_IN_PROGRESS" && latest) setWatching(latest.reference);
        void request.refetch();
      },
    });
  }

  return (
    <div className="customer-page">
      <section className="confirmation panel order-page relocation-page">
        <Icon size={40} />
        <h1>{heading(data.status, checking, c.text)}</h1>
        <p className="reference">
          <bdi>{data.reference}</bdi>
        </p>
        <p className={`status status--${RELOCATION_STATUS_TONE[data.status]}`}>{c.local(RELOCATION_STATUS_LABELS[data.status])}</p>
        {next && <p>{next}</p>}
        {data.status === "cancelled" && data.cancelReason && (
          <p className="small muted">
            {c.text("Reason: ", "السبب: ")}
            {data.cancelReason}
          </p>
        )}

        {checking && (
          <div className="note-box" role="status" aria-busy="true">
            {patient
              ? c.text(
                  "We have not heard back from the payment company yet. If you paid, your payment is confirmed within a few minutes and we email you. You can leave this page.",
                  "لم يصلنا رد شركة الدفع بعد. إذا دفعت، تُؤكَّد دفعتك خلال دقائق ونرسل لك بريداً. يمكنك مغادرة هذه الصفحة.",
                )
              : c.text("Checking your payment… This takes a few seconds.", "نتحقق من دفعتك… يستغرق ذلك بضع ثوانٍ.")}
          </div>
        )}
        {didNotGoThrough && (
          <p className="note-box" role="alert">
            {c.text("Your payment did not go through.", "لم تكتمل عملية الدفع.")}
            {data.payment.canPay &&
              data.payment.attemptsLeft > 0 &&
              c.text(
                ` You can try again (${data.payment.attemptsLeft} attempt${data.payment.attemptsLeft === 1 ? "" : "s"} left).`,
                ` يمكنك المحاولة مرة أخرى (المحاولات المتبقية: ${data.payment.attemptsLeft}).`,
              )}
          </p>
        )}
        {(refundLine ?? attentionLine) && <p className="note-box">{refundLine ?? attentionLine}</p>}

        {data.quote && (
          <div className="order-details">
            <h2>{c.text("Your quote", "عرض السعر")}</h2>
            <div className="order-lines">
              <div className="row spread order-total">
                <span>
                  {waiting
                    ? c.text("To pay", "المبلغ المطلوب")
                    : PAID_STATUSES.includes(data.status)
                      ? c.text("Paid", "المدفوع")
                      : c.text("Quote", "عرض السعر")}
                </span>
                <strong>{c.money(data.quote.amount)}</strong>
              </div>
            </div>
            {data.quote.note && <p className="relocation-text">{data.quote.note}</p>}
            <p className="small muted">{c.text(`Sent ${whenText(data.quote.issuedAt, c.locale)}`, `أُرسل في ${whenText(data.quote.issuedAt, c.locale)}`)}</p>
            {data.paidOutside ? (
              <p className="small">
                {c.text(
                  `Paid ${c.money(data.paidOutside.amount)} ${PAID_OUTSIDE_METHOD[data.paidOutside.method].en} on ${whenText(data.paidOutside.at, c.locale)}.`,
                  `دُفع ${c.money(data.paidOutside.amount)} ${PAID_OUTSIDE_METHOD[data.paidOutside.method].ar} في ${whenText(data.paidOutside.at, c.locale)}.`,
                )}
              </p>
            ) : (
              PAID_STATUSES.includes(data.status) && <p className="small">{c.text("Paid online.", "دُفع عبر الموقع.")}</p>
            )}
            {waiting && (!checking || patient) && (
              <PayActions request={data} open={paymentOpen} retry={didNotGoThrough} busy={pay.isPending || pay.isSuccess} onPay={startPayment} />
            )}
          </div>
        )}

        <div className="order-details">
          <h2>{c.text("Documents", "المستندات")}</h2>
          {unmatched > 0 && (
            <p className="note-box" role="status">
              {c.text(
                `${unmatched} of the files you chose could not be attached. Please upload them below.`,
                `تعذّر إرفاق ${unmatched} من الملفات التي اخترتها. يرجى رفعها أدناه.`,
              )}
            </p>
          )}
          <RelocationDocuments request={data} uploads={uploads.states} onUpload={uploads.add} />
          <p className="small muted">
            {c.text(
              `PDF, JPG or PNG, up to 10 MB each, at most ${RELOCATION_LIMITS.maxFilesPerRequest} files per request. Only you and our team can open them.`,
              `ملفات PDF أو JPG أو PNG، حتى ١٠ ميغابايت لكل ملف، و${RELOCATION_LIMITS.maxFilesPerRequest} ملفاً كحد أقصى لكل طلب. لا يفتحها إلا أنت وفريقنا.`,
            )}
          </p>
        </div>

        {data.updates.length > 0 && (
          <div className="order-details">
            <h2>{c.text("Updates from our team", "تحديثات من فريقنا")}</h2>
            <ul className="relocation-updates">
              {[...data.updates]
                .sort((a, b) => b.at.localeCompare(a.at))
                .map((update) => (
                  <li key={update.id}>
                    <p className="relocation-text">{update.text}</p>
                    <p className="small muted">{whenText(update.at, c.locale)}</p>
                  </li>
                ))}
            </ul>
          </div>
        )}

        <div className="order-details">
          <h2>{c.text("Timeline", "المسار الزمني")}</h2>
          <ol className="relocation-timeline">
            {[...data.history]
              .sort((a, b) => a.at.localeCompare(b.at))
              .map((entry) => (
                <li key={`${entry.at}-${entry.to}`}>
                  <strong>{c.local(RELOCATION_STATUS_LABELS[entry.to])}</strong>
                  <span className="small muted"> · {whenText(entry.at, c.locale)}</span>
                  {entry.reason && <p className="small muted">{entry.reason}</p>}
                </li>
              ))}
          </ol>
        </div>

        <RequestDetails request={data} />

        {actionError && (
          <p className="form-error" role="alert">
            {relocationErrorMessage(actionError, c.text)}
          </p>
        )}
        {data.canCancel &&
          (confirming ? (
            <div className="form-stack">
              <p>
                {c.text("Cancel this request?", "هل تريد إلغاء هذا الطلب؟")}
                {paymentOpen && c.text(" If you already paid, we will refund you.", " إذا كنت قد دفعت بالفعل، فسنعيد لك المبلغ.")}
              </p>
              <Field label={c.text("Why are you cancelling? (optional)", "لماذا تلغي الطلب؟ (اختياري)")}>
                <textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={RELOCATION_LIMITS.maxReasonChars} />
              </Field>
              <div className="row">
                <button
                  type="button"
                  className="button button--secondary"
                  disabled={cancel.isPending}
                  onClick={() => cancel.mutate(reason.trim(), { onSettled: () => setConfirming(false) })}
                >
                  {c.text("Yes, cancel the request", "نعم، ألغِ الطلب")}
                </button>
                <button type="button" className="text-button" onClick={() => setConfirming(false)}>
                  {c.text("Keep the request", "أبقِ الطلب")}
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="text-button" onClick={() => setConfirming(true)}>
              {c.text("Cancel request", "إلغاء الطلب")}
            </button>
          ))}
        {!data.canCancel && (data.status === "paid" || data.status === "in_progress") && (
          <p className="small muted">
            {c.text("This request is paid, so only our team can cancel it. Please contact us.", "هذا الطلب مدفوع، لذا يمكن لفريقنا فقط إلغاؤه. يرجى التواصل معنا.")}
          </p>
        )}

        <ContactLine reference={data.reference} />
        <Link href="/account/relocation" className="text-link">
          {c.text("My relocation requests", "طلبات النقل")}
        </Link>
        <ActionLink href="/relocation">{c.text("Back to relocation", "العودة إلى النقل")}</ActionLink>
      </section>
    </div>
  );
}

/** Pay now, Continue to payment (an open attempt) or Pay again (D138); or why paying is not possible. */
function PayActions({
  request,
  open,
  retry,
  busy,
  onPay,
}: {
  request: CustomerRelocationRequest;
  open: boolean;
  retry: boolean;
  busy: boolean;
  onPay: () => void;
}) {
  const c = useCopy();
  const amount = request.quote?.amount ?? 0;
  if (!request.payment.canPay) {
    return (
      <p className="note-box">
        {!open && request.payment.attemptsLeft === 0
          ? c.text("This quote has reached the limit of 3 payment attempts. Please contact us.", "وصل عرض السعر هذا إلى الحد الأقصى وهو ٣ محاولات دفع. يرجى التواصل معنا.")
          : c.text("Online payment is not available at the moment. Please contact us to pay your quote.", "الدفع الإلكتروني غير متاح حالياً. يرجى التواصل معنا لدفع عرض السعر.")}
      </p>
    );
  }
  return (
    <div className="form-stack">
      <button type="button" className="button button--primary" disabled={busy} onClick={onPay}>
        {open
          ? c.text("Continue to payment", "متابعة الدفع")
          : retry
            ? c.text("Pay again", "ادفع مرة أخرى")
            : c.text(`Pay ${c.money(amount)} now`, `ادفع ${c.money(amount)} الآن`)}
      </button>
      <p className="small muted">
        {open
          ? c.text("You have started paying this quote. Continue to finish the same payment.", "لقد بدأت دفع عرض السعر هذا. تابع لإكمال الدفعة نفسها.")
          : c.text("You pay on the payment company's secure page, then come back here.", "تدفع في صفحة شركة الدفع الآمنة، ثم تعود إلى هنا.")}
      </p>
    </div>
  );
}

/** The request as sent: the pets, the journey and the contact details (the request's own copy). */
function RequestDetails({ request }: { request: CustomerRelocationRequest }) {
  const c = useCopy();
  return (
    <>
      <div className="order-details">
        <h2>{request.pets.length === 1 ? c.text("Your pet", "حيوانك") : c.text("Your pets", "حيواناتك")}</h2>
        <ul className="relocation-summary">
          {request.pets.map((pet) => (
            <li key={pet.id}>
              <strong>{pet.name}</strong>
              <span className="small muted">
                {[
                  pet.petType ? c.local(pet.petType) : "",
                  pet.breed,
                  petAgeText(pet.ageMonths, c.text),
                  pet.weightGrams === null ? "" : weightText(pet.weightGrams, c.locale),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              {pet.microchip && (
                <span className="small muted">
                  {c.text("Microchip ", "الشريحة ")}
                  <bdi dir="ltr">{pet.microchip}</bdi>
                </span>
              )}
              {pet.notes && <span className="small">{pet.notes}</span>}
            </li>
          ))}
        </ul>
      </div>
      <div className="order-details">
        <h2>{c.text("The journey", "الرحلة")}</h2>
        <p>
          {c.text("From", "من")} {[request.origin.city, request.origin.country].filter(Boolean).join(c.text(", ", "، "))} · {c.text("To", "إلى")}{" "}
          {c.local(request.destination.name)}
        </p>
        <p className="small muted">
          {request.plannedDate
            ? c.text(`Planned for about ${dayText(request.plannedDate, c.locale)}`, `مخطط له في حوالي ${dayText(request.plannedDate, c.locale)}`)
            : c.text("No date given yet", "لم يُحدَّد تاريخ بعد")}
        </p>
        {request.note && <p className="small relocation-text">{request.note}</p>}
        <p className="small muted">{c.text(`Sent ${whenText(request.placedAt, c.locale)}`, `أُرسل في ${whenText(request.placedAt, c.locale)}`)}</p>
      </div>
      <div className="order-details">
        <h2>{c.text("Your details", "بياناتك")}</h2>
        <p>{request.contact.name}</p>
        <p className="small">
          <bdi dir="ltr">{request.contact.email}</bdi> · <bdi dir="ltr">{formatPhone(request.contact.phone)}</bdi>
        </p>
      </div>
    </>
  );
}

/** Questions go to the business phone and WhatsApp from Settings (D232), when they are set. */
function ContactLine({ reference }: { reference: string }) {
  const c = useCopy();
  const { settings } = usePublicSettings();
  const phone = settings?.phone ?? null;
  const whatsapp = whatsappLink(
    settings?.socialLinks.whatsapp ?? "",
    c.text(`Hi Nennus Catio, I have a question about my relocation request ${reference}.`, `مرحباً Nennus Catio، لدي سؤال عن طلب النقل ${reference}.`),
  );
  if (!phone && !whatsapp) return null;
  return (
    <p className="small">
      {c.text("Questions about your request? ", "لديك أسئلة عن طلبك؟ ")}
      {phone && (
        <>
          {c.text("Call us on ", "اتصل بنا على ")}
          <a href={`tel:${phone}`} className="text-link">
            <bdi dir="ltr">{formatPhone(phone)}</bdi>
          </a>
          {whatsapp && c.text(" or ", " أو ")}
        </>
      )}
      {whatsapp && (
        <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="text-link">
          {phone ? c.text("message us on WhatsApp", "راسلنا عبر واتساب") : c.text("Message us on WhatsApp", "راسلنا عبر واتساب")}
        </a>
      )}
      .
    </p>
  );
}
