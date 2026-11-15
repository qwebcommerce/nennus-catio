"use client";

import { type AdminRelocation, type AdminRelocationSlot, RELOCATION_LIMITS, type RelocationDocumentType } from "@nennus-catio/contracts";
import { type FormEvent, useState } from "react";
import {
  describeAdminRelocationError,
  useAskRelocationDocument,
  useIssueRelocationQuote,
  useRecordRelocationPaidOutside,
  useRecordRelocationRefundOutside,
  useReviewRelocationDocument,
  useStaffCancelRelocation,
  useWithdrawRelocationQuote,
} from "@/shared/api/admin-relocation";
import { useCopy } from "@/shared/lib/copy";
import { ErrorMessage, Field, Modal } from "@/shared/ui/BusinessUI";
import { NumberInput } from "@/shared/ui/NumberInput";
import { PAID_OUTSIDE_METHOD } from "../lib/relocation-labels";

/**
 * The staff relocation dialogs (15d). Each one is the "Are you sure?" (D128): it says what will happen
 * and sends nothing until its button, like the staff booking dialogs. Each answers with the request.
 */

type Done = (request: AdminRelocation) => void;

/** Whole QAR typed by staff ("1,250" refused, "1250" fine) as minor units; null when not a whole amount. */
function wholeDirhams(value: string): number | null {
  const trimmed = value.trim();
  return /^\d{1,6}$/.test(trimmed) ? Number(trimmed) * 100 : null;
}

/** QAR with up to two decimals as minor units; null when not an amount. */
function dirhams(value: string): number | null {
  const match = /^(\d{1,6})(?:\.(\d{1,2}))?$/.exec(value.trim());
  return match ? Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0")) : null;
}

function Actions({ busy, keepLabel, confirmLabel, danger, onClose }: { busy: boolean; keepLabel: string; confirmLabel: string; danger?: boolean; onClose: () => void }) {
  return (
    <div className="row confirm-actions">
      <button type="button" className="button button--secondary" disabled={busy} onClick={onClose}>
        {keepLabel}
      </button>
      <button type="submit" className={`button ${danger ? "button--danger" : "button--primary"}`} disabled={busy}>
        {confirmLabel}
      </button>
    </div>
  );
}

// --- Cancel ---------------------------------------------------------------------------------------------

/** Staff cancel with a reason, at any time before Completed (D279 answer 11). */
export function CancelRelocationDialog({
  request,
  paymentInProgress,
  onClose,
  onDone,
}: {
  request: AdminRelocation | null;
  paymentInProgress: boolean;
  onClose: () => void;
  onDone: Done;
}) {
  return request ? <CancelForm key={`${request.reference}-${request.version}`} request={request} paymentInProgress={paymentInProgress} onClose={onClose} onDone={onDone} /> : null;
}

function CancelForm({ request, paymentInProgress, onClose, onDone }: { request: AdminRelocation; paymentInProgress: boolean; onClose: () => void; onDone: Done }) {
  const c = useCopy();
  const cancel = useStaffCancelRelocation();
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const paid = request.paidAt !== null || request.paidOutside;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (reason.trim().length < 3) {
      setError(c.text("Please give a reason (at least 3 characters).", "يرجى كتابة السبب (٣ أحرف على الأقل)."));
      return;
    }
    try {
      onDone(await cancel.mutateAsync({ request, reason: reason.trim() }));
      onClose();
    } catch (err) {
      setError(describeAdminRelocationError(err, c.text));
    }
  }

  const effects = [
    paid
      ? c.text(
          "It was paid, so it will be marked Refund needed: refund it on the Quote tab.",
          "إنه مدفوع، لذا سيُعلَّم بأنه يحتاج استرداداً: استرده من تبويب عرض السعر.",
        )
      : paymentInProgress
        ? c.text(
            "The customer has started paying: the payment company is asked to stop the payment. If the customer has already paid, the request is marked Refund needed.",
            "بدأ العميل الدفع: يُطلب من شركة الدفع إيقاف الدفعة. إذا كان العميل قد دفع بالفعل، يُعلَّم الطلب بأنه يحتاج استرداداً.",
          )
        : null,
    c.text("The customer gets a cancellation email with this reason.", "يصل العميل بريد إلغاء بهذا السبب."),
    c.text("Its documents are kept until the owner's retention days pass.", "تبقى مستنداته حتى انقضاء أيام الاحتفاظ التي حددها المالك."),
  ].filter(Boolean);

  return (
    <Modal
      open
      onOpenChange={(open) => !open && !cancel.isPending && onClose()}
      title={c.text(`Cancel relocation request ${request.reference}?`, `إلغاء طلب النقل ${request.reference}؟`)}
      description={effects.join(" ")}
    >
      <form className="form-stack" onSubmit={submit}>
        <Field label={c.text("Reason (the customer sees it)", "السبب (يراه العميل)")}>
          <textarea aria-required="true" maxLength={RELOCATION_LIMITS.maxReasonChars} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <ErrorMessage message={error} />
        <Actions busy={cancel.isPending} keepLabel={c.text("Keep request", "الإبقاء على الطلب")} confirmLabel={c.text("Cancel request", "إلغاء الطلب")} danger onClose={onClose} />
      </form>
    </Modal>
  );
}

// --- The quote --------------------------------------------------------------------------------------------

/** Issue the quote: whole QAR 1 to 100,000 and what it covers (plan section 4.4). */
export function IssueQuoteDialog({ request, onClose, onDone }: { request: AdminRelocation | null; onClose: () => void; onDone: Done }) {
  return request ? <IssueQuoteForm key={`${request.reference}-${request.version}`} request={request} onClose={onClose} onDone={onDone} /> : null;
}

function IssueQuoteForm({ request, onClose, onDone }: { request: AdminRelocation; onClose: () => void; onDone: Done }) {
  const c = useCopy();
  const issue = useIssueRelocationQuote();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  // From Documents Requested the quote is allowed, naming what is still missing (plan section 4.2).
  const missing = request.documents.filter((slot) => slot.required && (slot.status === "missing" || slot.status === "needs_new_copy"));

  async function submit(event: FormEvent) {
    event.preventDefault();
    const minor = wholeDirhams(amount);
    if (minor === null || minor < RELOCATION_LIMITS.minQuoteMinor || minor > RELOCATION_LIMITS.maxQuoteMinor) {
      setError(c.text("Enter whole dirhams from 1 to 100,000.", "أدخل ريالات كاملة من ١ إلى ١٠٠٬٠٠٠."));
      return;
    }
    if (!note.trim()) {
      setError(c.text("Say what the quote covers.", "اذكر ما يشمله عرض السعر."));
      return;
    }
    try {
      onDone(await issue.mutateAsync({ request, amount: minor, note: note.trim() }));
      onClose();
    } catch (err) {
      setError(describeAdminRelocationError(err, c.text));
    }
  }

  const missingLine =
    missing.length > 0
      ? c.text(
          `Still missing: ${missing.map((slot) => `${slot.name.en}${slot.pet ? ` (${slot.pet.name})` : ""}`).join(", ")}. You can still send the quote.`,
          `ما زال ناقصاً: ${missing.map((slot) => `${slot.name.ar}${slot.pet ? ` (${slot.pet.name})` : ""}`).join("، ")}. يمكنك إرسال عرض السعر رغم ذلك.`,
        )
      : "";

  return (
    <Modal
      open
      onOpenChange={(open) => !open && !issue.isPending && onClose()}
      title={c.text(`Issue a quote for ${request.reference}?`, `إصدار عرض سعر للطلب ${request.reference}؟`)}
      description={[
        missingLine,
        c.text(
          "The customer gets an email with the quote and Pay now, and the request moves to Quote sent.",
          "يصل العميل بريد بعرض السعر وزر الدفع، وينتقل الطلب إلى عرض سعر مرسل.",
        ),
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <form className="form-stack" onSubmit={submit}>
        <Field label={c.text("Amount in QAR (whole dirhams)", "المبلغ بالريال القطري (ريالات كاملة)")}>
          <NumberInput dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} min={1} max={100_000} maxLength={6} aria-required="true" />
        </Field>
        <Field label={c.text("What it covers (the customer reads this)", "ما يشمله (يقرؤه العميل)")}>
          <textarea aria-required="true" maxLength={RELOCATION_LIMITS.maxQuoteNoteChars} rows={4} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <ErrorMessage message={error} />
        <Actions busy={issue.isPending} keepLabel={c.text("Not now", "ليس الآن")} confirmLabel={c.text("Send quote", "إرسال عرض السعر")} onClose={onClose} />
      </form>
    </Modal>
  );
}

/** Withdraw an unpaid quote: back to Under review; refused while a payment page is open (D281). */
export function WithdrawQuoteDialog({ request, onClose, onDone }: { request: AdminRelocation | null; onClose: () => void; onDone: Done }) {
  return request ? <WithdrawForm key={`${request.reference}-${request.version}`} request={request} onClose={onClose} onDone={onDone} /> : null;
}

function WithdrawForm({ request, onClose, onDone }: { request: AdminRelocation; onClose: () => void; onDone: Done }) {
  const c = useCopy();
  const withdraw = useWithdrawRelocationQuote();
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      onDone(await withdraw.mutateAsync({ request, reason: reason.trim() }));
      onClose();
    } catch (err) {
      setError(describeAdminRelocationError(err, c.text));
    }
  }

  return (
    <Modal
      open
      onOpenChange={(open) => !open && !withdraw.isPending && onClose()}
      title={c.text(`Withdraw the quote for ${request.reference}?`, `سحب عرض السعر للطلب ${request.reference}؟`)}
      description={c.text(
        "The quote is taken back and the request returns to Under review; the customer gets an email. A new quote can follow. If the customer has a payment page open, the quote cannot be withdrawn until it closes (within about an hour).",
        "يُسحب عرض السعر ويعود الطلب إلى قيد المراجعة؛ ويصل العميل بريد. يمكن إصدار عرض جديد بعدها. إذا كانت لدى العميل صفحة دفع مفتوحة، فلا يمكن السحب حتى تُغلق (خلال ساعة تقريباً).",
      )}
    >
      <form className="form-stack" onSubmit={submit}>
        <Field label={c.text("Reason (optional; the customer sees it)", "السبب (اختياري؛ يراه العميل)")}>
          <textarea maxLength={RELOCATION_LIMITS.maxReasonChars} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <ErrorMessage message={error} />
        <Actions busy={withdraw.isPending} keepLabel={c.text("Keep the quote", "الإبقاء على عرض السعر")} confirmLabel={c.text("Withdraw quote", "سحب عرض السعر")} danger onClose={onClose} />
      </form>
    </Modal>
  );
}

// --- Documents --------------------------------------------------------------------------------------------

/** Ask for a new copy of one document, with the reason the customer sees (D279 answer 7). */
export function NewCopyDialog({ request, slot, onClose, onDone }: { request: AdminRelocation; slot: AdminRelocationSlot | null; onClose: () => void; onDone: Done }) {
  return slot ? <NewCopyForm key={`${slot.id}-${request.version}`} request={request} slot={slot} onClose={onClose} onDone={onDone} /> : null;
}

function NewCopyForm({ request, slot, onClose, onDone }: { request: AdminRelocation; slot: AdminRelocationSlot; onClose: () => void; onDone: Done }) {
  const c = useCopy();
  const review = useReviewRelocationDocument();
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const name = `${c.local(slot.name)}${slot.pet ? ` (${slot.pet.name})` : ""}`;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (reason.trim().length < 3) {
      setError(c.text("Tell the customer why a new copy is needed (at least 3 characters).", "أخبر العميل لماذا يحتاج إلى نسخة جديدة (٣ أحرف على الأقل)."));
      return;
    }
    try {
      onDone(await review.mutateAsync({ request, slotId: slot.id, outcome: "new_copy", reason: reason.trim() }));
      onClose();
    } catch (err) {
      setError(describeAdminRelocationError(err, c.text));
    }
  }

  return (
    <Modal
      open
      onOpenChange={(open) => !open && !review.isPending && onClose()}
      title={c.text(`Ask for a new copy of ${name}?`, `طلب نسخة جديدة من ${name}؟`)}
      description={c.text(
        "The customer sees this reason on their request page and gets an email. While documents are being collected, the request goes back to Documents requested.",
        "يرى العميل هذا السبب في صفحة طلبه ويصله بريد. أثناء جمع المستندات يعود الطلب إلى مستندات مطلوبة.",
      )}
    >
      <form className="form-stack" onSubmit={submit}>
        <Field label={c.text("Why a new copy is needed", "لماذا نحتاج إلى نسخة جديدة")}>
          <textarea aria-required="true" maxLength={RELOCATION_LIMITS.maxReasonChars} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <ErrorMessage message={error} />
        <Actions busy={review.isPending} keepLabel={c.text("Not now", "ليس الآن")} confirmLabel={c.text("Ask for a new copy", "طلب نسخة جديدة")} onClose={onClose} />
      </form>
    </Modal>
  );
}

/** Ask for a document: from the owner's list or by name, for one pet or the whole request (plan section 4.3). */
export function AskDocumentDialog({
  request,
  open,
  types,
  onClose,
  onDone,
}: {
  request: AdminRelocation;
  open: boolean;
  /** The owner's active document types. */
  types: readonly RelocationDocumentType[];
  onClose: () => void;
  onDone: Done;
}) {
  return open ? <AskForm key={request.version} request={request} types={types} onClose={onClose} onDone={onDone} /> : null;
}

function AskForm({ request, types, onClose, onDone }: { request: AdminRelocation; types: readonly RelocationDocumentType[]; onClose: () => void; onDone: Done }) {
  const c = useCopy();
  const ask = useAskRelocationDocument();
  const [typeId, setTypeId] = useState(types[0]?.id ?? "other");
  const [nameEn, setNameEn] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [petId, setPetId] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const other = typeId === "other";

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (other && (!nameEn.trim() || !nameAr.trim())) {
      setError(c.text("Give the document's name in English and in Arabic.", "اكتب اسم المستند بالإنجليزية والعربية."));
      return;
    }
    try {
      onDone(
        await ask.mutateAsync({
          request,
          petId: petId || null,
          typeId: other ? null : typeId,
          name: other ? { en: nameEn.trim(), ar: nameAr.trim() } : null,
          note: note.trim(),
        }),
      );
      onClose();
    } catch (err) {
      setError(describeAdminRelocationError(err, c.text));
    }
  }

  return (
    <Modal
      open
      onOpenChange={(open) => !open && !ask.isPending && onClose()}
      title={c.text(`Ask the customer for a document for ${request.reference}?`, `طلب مستند من العميل للطلب ${request.reference}؟`)}
      description={c.text(
        "The customer gets an email asking for it, and it appears on their request page to upload.",
        "يصل العميل بريد يطلبه، ويظهر في صفحة طلبه ليرفعه.",
      )}
    >
      <form className="form-stack" onSubmit={submit}>
        <Field label={c.text("Document", "المستند")}>
          <select value={typeId} onChange={(e) => setTypeId(e.target.value)}>
            {types.map((type) => (
              <option key={type.id} value={type.id}>
                {c.local(type.name)}
              </option>
            ))}
            <option value="other">{c.text("Another document (type its name)", "مستند آخر (اكتب اسمه)")}</option>
          </select>
        </Field>
        {other && (
          <div className="form-two">
            <Field label={c.text("Name in English", "الاسم بالإنجليزية")}>
              <input dir="ltr" maxLength={80} value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
            </Field>
            <Field label={c.text("Name in Arabic", "الاسم بالعربية")}>
              <input dir="rtl" maxLength={80} value={nameAr} onChange={(e) => setNameAr(e.target.value)} />
            </Field>
          </div>
        )}
        <Field label={c.text("For", "لـ")}>
          <select value={petId} onChange={(e) => setPetId(e.target.value)}>
            <option value="">{c.text("The whole request", "الطلب كاملاً")}</option>
            {request.petDetails.map((pet) => (
              <option key={pet.id} value={pet.id}>
                {pet.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={c.text("Note for the customer (optional)", "ملاحظة للعميل (اختيارية)")}>
          <textarea maxLength={RELOCATION_LIMITS.maxReasonChars} rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <ErrorMessage message={error} />
        <Actions busy={ask.isPending} keepLabel={c.text("Not now", "ليس الآن")} confirmLabel={c.text("Ask for it", "اطلبه")} onClose={onClose} />
      </form>
    </Modal>
  );
}

// --- Money outside the website (Relocation Refund, D279 answer 10) ----------------------------------------------

export function PaidOutsideDialog({ request, onClose, onDone }: { request: AdminRelocation | null; onClose: () => void; onDone: Done }) {
  return request ? <PaidOutsideForm key={`${request.reference}-${request.version}`} request={request} onClose={onClose} onDone={onDone} /> : null;
}

function PaidOutsideForm({ request, onClose, onDone }: { request: AdminRelocation; onClose: () => void; onDone: Done }) {
  const c = useCopy();
  const record = useRecordRelocationPaidOutside();
  const [method, setMethod] = useState<"bank_transfer" | "cash" | "other">("bank_transfer");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const amount = request.quoteDetails?.amount ?? 0;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!reference.trim()) {
      setError(c.text("Enter the transfer's or receipt's reference.", "أدخل مرجع التحويل أو الإيصال."));
      return;
    }
    try {
      onDone(await record.mutateAsync({ request, method, reference: reference.trim(), note: note.trim() }));
      onClose();
    } catch (err) {
      setError(describeAdminRelocationError(err, c.text));
    }
  }

  return (
    <Modal
      open
      onOpenChange={(open) => !open && !record.isPending && onClose()}
      title={c.text(`Record a payment of ${c.money(amount)} made outside the website?`, `تسجيل دفعة بقيمة ${c.money(amount)} تمت خارج الموقع؟`)}
      description={c.text(
        "Only once the money has arrived. The quote is recorded as paid outside the website, the request moves to Paid and the customer gets a payment email. It is never counted as online sales.",
        "فقط بعد وصول المبلغ. يُسجَّل عرض السعر كمدفوع خارج الموقع، وينتقل الطلب إلى مدفوع، ويصل العميل بريد بالدفع. لا يُحتسب أبداً ضمن مبيعات الموقع.",
      )}
    >
      <form className="form-stack" onSubmit={submit}>
        <Field label={c.text("How it was paid", "طريقة الدفع")}>
          <select value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
            {(Object.keys(PAID_OUTSIDE_METHOD) as (keyof typeof PAID_OUTSIDE_METHOD)[]).map((value) => (
              <option key={value} value={value}>
                {c.local(PAID_OUTSIDE_METHOD[value])}
              </option>
            ))}
          </select>
        </Field>
        <Field label={c.text("Reference (transfer or receipt)", "المرجع (التحويل أو الإيصال)")}>
          <input dir="ltr" maxLength={100} value={reference} onChange={(e) => setReference(e.target.value)} aria-required="true" />
        </Field>
        <Field label={c.text("Note (staff only, optional)", "ملاحظة (للموظفين فقط، اختيارية)")}>
          <textarea maxLength={RELOCATION_LIMITS.maxReasonChars} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <ErrorMessage message={error} />
        <Actions busy={record.isPending} keepLabel={c.text("Not now", "ليس الآن")} confirmLabel={c.text("Record payment", "تسجيل الدفعة")} onClose={onClose} />
      </form>
    </Modal>
  );
}

export function RefundOutsideDialog({ request, onClose, onDone }: { request: AdminRelocation | null; onClose: () => void; onDone: Done }) {
  return request ? <RefundOutsideForm key={`${request.reference}-${request.version}`} request={request} onClose={onClose} onDone={onDone} /> : null;
}

function RefundOutsideForm({ request, onClose, onDone }: { request: AdminRelocation; onClose: () => void; onDone: Done }) {
  const c = useCopy();
  const record = useRecordRelocationRefundOutside();
  const paid = request.paidOutsideDetails?.amount ?? 0;
  const [amount, setAmount] = useState(paid > 0 ? (paid / 100).toFixed(2) : "");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    const minor = dirhams(amount);
    if (minor === null || minor < 1 || minor > paid) {
      setError(c.text(`Enter an amount up to ${c.money(paid)}.`, `أدخل مبلغاً حتى ${c.money(paid)}.`));
      return;
    }
    if (!reference.trim()) {
      setError(c.text("Enter the refund's reference.", "أدخل مرجع الاسترداد."));
      return;
    }
    try {
      onDone(await record.mutateAsync({ request, amount: minor, reference: reference.trim(), note: note.trim() }));
      onClose();
    } catch (err) {
      setError(describeAdminRelocationError(err, c.text));
    }
  }

  return (
    <Modal
      open
      onOpenChange={(open) => !open && !record.isPending && onClose()}
      title={c.text(`Record a refund made outside the website for ${request.reference}?`, `تسجيل استرداد تم خارج الموقع للطلب ${request.reference}؟`)}
      description={c.text(
        "Only after the money was given back outside the website. It is recorded once, and the customer gets a refund email.",
        "فقط بعد إعادة المبلغ خارج الموقع. يُسجَّل مرة واحدة، ويصل العميل بريد بالاسترداد.",
      )}
    >
      <form className="form-stack" onSubmit={submit}>
        <Field label={c.text("Amount refunded, QAR", "المبلغ المسترد، ر.ق")}>
          <NumberInput kind="decimal" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} min={0.01} max={paid / 100} maxLength={9} />
        </Field>
        <Field label={c.text("Reference", "المرجع")}>
          <input dir="ltr" maxLength={100} value={reference} onChange={(e) => setReference(e.target.value)} aria-required="true" />
        </Field>
        <Field label={c.text("Note (staff only, optional)", "ملاحظة (للموظفين فقط، اختيارية)")}>
          <textarea maxLength={RELOCATION_LIMITS.maxReasonChars} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <ErrorMessage message={error} />
        <Actions busy={record.isPending} keepLabel={c.text("Not now", "ليس الآن")} confirmLabel={c.text("Record refund", "تسجيل الاسترداد")} onClose={onClose} />
      </form>
    </Modal>
  );
}
