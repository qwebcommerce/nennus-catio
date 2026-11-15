"use client";

import {
  type AdminRelocation,
  type AdminRelocationSlot,
  OPEN_PAYMENT_STATUSES,
  type PaymentStatus,
  RELOCATION_LIMITS,
  type RelocationStatus,
} from "@nennus-catio/contracts";
import { CalendarDays, FileText, Mail, PawPrint, Phone, Plane, X } from "lucide-react";
import { type FormEvent, type RefObject, useState } from "react";
import { petAge } from "@/features/admin/bookings/lib/booking-labels";
import { CustomerRecordLink } from "@/features/admin/customers/components/CustomerRecordLink";
import { PaymentsPanel } from "@/features/admin/orders/components/OrderPayments";
import { placedAt } from "@/features/admin/orders/lib/admin-order-labels";
import { fileSizeText } from "@/features/relocation/lib/format";
import { useAdminAccess } from "@/shared/access/AdminAccess";
import {
  describeAdminRelocationError,
  staffRelocationFileHref,
  useAddRelocationNote,
  useAddRelocationUpdate,
  useAdminRelocation,
  useDeleteRelocationFile,
  useDeleteRelocationNote,
  useDeleteRelocationUpdate,
  useRelocationSettings,
  useRelocationStep,
  useReviewRelocationDocument,
} from "@/shared/api/admin-relocation";
import { usePayments } from "@/shared/api/admin-payments";
import { RELOCATION_STATUS_TONE } from "@/shared/api/relocation";
import { useCopy } from "@/shared/lib/copy";
import { formatMoney } from "@/shared/lib/format";
import { ErrorMessage, Field } from "@/shared/ui/BusinessUI";
import { ConfirmDialog, type ConfirmRequest } from "@/shared/ui/ConfirmDialog";
import { ADMIN_RELOCATION_STATUS, ADMIN_SLOT_STATUS, ADMIN_SLOT_TONE, PAID_OUTSIDE_METHOD, plannedLabel, RELOCATION_ATTENTION } from "../lib/relocation-labels";
import {
  AskDocumentDialog,
  CancelRelocationDialog,
  IssueQuoteDialog,
  NewCopyDialog,
  PaidOutsideDialog,
  RefundOutsideDialog,
  WithdrawQuoteDialog,
} from "./RelocationDialogs";

const OPEN_PAYMENT: readonly PaymentStatus[] = OPEN_PAYMENT_STATUSES;

type Tab = "request" | "documents" | "quote" | "progress" | "notes" | "history";

export function RelocationStatusBadge({ status }: { status: RelocationStatus }) {
  const c = useCopy();
  return <span className={`status status--${RELOCATION_STATUS_TONE[status]}`}>{c.local(ADMIN_RELOCATION_STATUS[status])}</span>;
}

/**
 * One relocation request for staff (15d; plan section 4.7): the steps (Start review, Issue quote, Start
 * the relocation, Mark completed) and Cancel at the top, each asking first (D128), then six tabs: the
 * request, its documents, the quote and payment, the updates the customer sees, staff notes, and the
 * history. Every change sends the request's version; someone else's change in between reloads it.
 */
export function RelocationApiDetail({ reference, close, panelRef }: { reference: string; close: () => void; panelRef: RefObject<HTMLElement | null> }) {
  const c = useCopy();
  const access = useAdminAccess();
  const canEdit = access.can("relocation", "edit");
  const canRefund = access.can("relocation", "refund");
  const query = useAdminRelocation(reference);
  // The same request as the payment section (one fetch): the cancel dialog warns about an open payment (D146).
  const payments = usePayments({ kind: "relocation", reference });
  const paymentInProgress = payments.data?.attempts.some((attempt) => OPEN_PAYMENT.includes(attempt.status)) ?? false;
  const step = useRelocationStep();
  const [tab, setTab] = useState<Tab>("request");
  const [confirming, setConfirming] = useState<ConfirmRequest | null>(null);
  const [cancelling, setCancelling] = useState<AdminRelocation | null>(null);
  const [quoting, setQuoting] = useState<AdminRelocation | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const request = query.data;
  const status = (value: RelocationStatus) => c.local(ADMIN_RELOCATION_STATUS[value]);
  const report = (message: string, problem = false) => {
    setNotice(problem ? "" : message);
    setError(problem ? message : "");
  };
  const tabs: readonly { value: Tab; label: string }[] = [
    { value: "request", label: c.text("Request", "الطلب") },
    { value: "documents", label: c.text("Documents", "المستندات") },
    { value: "quote", label: c.text("Quote", "عرض السعر") },
    { value: "progress", label: c.text("Progress", "التقدم") },
    { value: "notes", label: c.text("Notes", "الملاحظات") },
    { value: "history", label: c.text("History", "السجل") },
  ];

  function askStep(current: AdminRelocation, kind: "start-review" | "start" | "complete") {
    report("");
    const target: RelocationStatus = kind === "start-review" ? "under_review" : kind === "start" ? "in_progress" : "completed";
    const message =
      kind === "start-review"
        ? c.text("It is recorded in the history with your name. No email is sent.", "يُسجَّل في السجل باسمك. لا يُرسل بريد إلكتروني.")
        : kind === "start"
          ? c.text("The customer gets an email that the relocation has started.", "يصل العميل بريد بأن النقل قد بدأ.")
          : c.text(
              "Completed is final: the request can no longer change, and its files are deleted after the owner's retention days. The customer gets an email.",
              "الاكتمال نهائي: لا يمكن تغيير الطلب بعدها، وتُحذف ملفاته بعد أيام الاحتفاظ التي حددها المالك. يصل العميل بريد إلكتروني.",
            );
    setConfirming({
      title: c.text(`Move relocation request ${current.reference} to ${status(target)}?`, `نقل طلب النقل ${current.reference} إلى ${status(target)}؟`),
      message,
      confirmLabel:
        kind === "start-review" ? c.text("Start review", "ابدأ المراجعة") : kind === "start" ? c.text("Start the relocation", "ابدأ النقل") : c.text("Mark completed", "تحديد: مكتمل"),
      run: async () => {
        try {
          const saved = await step.mutateAsync({ request: current, step: kind });
          report(c.text(`Request ${saved.reference} is now ${status(saved.status)}.`, `الطلب ${saved.reference} الآن ${status(saved.status)}.`));
        } catch (err) {
          report(describeAdminRelocationError(err, c.text), true);
        }
      },
    });
  }

  return (
    <aside
      ref={panelRef}
      tabIndex={-1}
      className="panel orders-detail customers-detail relocation-detail"
      aria-labelledby="relocation-detail-title"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !confirming && !cancelling && !quoting && event.currentTarget.contains(event.target as Node)) close();
      }}
    >
      <button type="button" className="icon-button orders-detail-close" aria-label={c.text("Close request details", "إغلاق تفاصيل الطلب")} onClick={close}>
        <X size={18} />
      </button>
      <h2 id="relocation-detail-title">
        {c.text("Relocation ", "نقل ")}
        <bdi>{reference}</bdi>
      </h2>
      {query.isPending && (
        <p className="muted" role="status" aria-busy="true">
          {c.text("Loading the request…", "جارٍ تحميل الطلب…")}
        </p>
      )}
      {query.isError && !request && (
        <div className="inline-state" role="alert">
          <p>{describeAdminRelocationError(query.error, c.text)}</p>
          <button type="button" className="button button--secondary" onClick={() => void query.refetch()}>
            {c.text("Retry", "أعد المحاولة")}
          </button>
        </div>
      )}
      {request && (
        <>
          <div className="orders-detail-meta">
            <time dateTime={request.placedAt}>{placedAt(request.placedAt, c.locale)}</time>
            <RelocationStatusBadge status={request.status} />
          </div>
          {canEdit && (request.actions.startReview || request.actions.issueQuote || request.actions.start || request.actions.complete || request.actions.cancel) && (
            <div className="orders-detail-actions orders-detail-actions--real">
              {request.actions.startReview && (
                <button type="button" className="button button--secondary" disabled={step.isPending} onClick={() => askStep(request, "start-review")}>
                  {c.text("Start review", "ابدأ المراجعة")}
                </button>
              )}
              {request.actions.issueQuote && (
                <button
                  type="button"
                  className="button button--primary"
                  onClick={() => {
                    report("");
                    setQuoting(request);
                  }}
                >
                  {c.text("Issue quote", "إصدار عرض السعر")}
                </button>
              )}
              {request.actions.start && (
                <button type="button" className="button button--primary" disabled={step.isPending} onClick={() => askStep(request, "start")}>
                  {c.text("Start the relocation", "ابدأ النقل")}
                </button>
              )}
              {request.actions.complete && (
                <button type="button" className="button button--primary" disabled={step.isPending} onClick={() => askStep(request, "complete")}>
                  {c.text("Mark completed", "تحديد: مكتمل")}
                </button>
              )}
              {request.actions.cancel && (
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() => {
                    report("");
                    setCancelling(request);
                  }}
                >
                  {c.text("Cancel request", "إلغاء الطلب")}
                </button>
              )}
            </div>
          )}
          <ErrorMessage message={error} />
          <p role="status" className="small">
            {notice}
          </p>
          {request.attention && (
            <p className="note-box small" role="note">
              <strong>{c.local(RELOCATION_ATTENTION[request.attention].title)} </strong>
              {c.local(RELOCATION_ATTENTION[request.attention].action)}
            </p>
          )}
          {request.refundNeeded && (
            <p className="note-box small" role="note">
              <strong>{c.text("Refund needed. ", "يحتاج استرداداً. ")}</strong>
              {canRefund
                ? c.text("This request was paid and then cancelled. Refund it on the Quote tab.", "دُفع هذا الطلب ثم أُلغي. استرده من تبويب عرض السعر.")
                : c.text(
                    "This request was paid and then cancelled. Someone with the Refund permission must refund it on the Quote tab.",
                    "دُفع هذا الطلب ثم أُلغي. يجب أن يسترده شخص لديه صلاحية الاسترداد من تبويب عرض السعر.",
                  )}
            </p>
          )}
          <div role="tablist" aria-label={c.text("Request details", "تفاصيل الطلب")} className="customers-detail-tabs relocation-detail-tabs">
            {tabs.map(({ value, label }, index) => (
              <button
                type="button"
                key={value}
                role="tab"
                id={`relocation-tab-${value}`}
                aria-selected={tab === value}
                aria-controls="relocation-tab-content"
                tabIndex={tab === value ? 0 : -1}
                onClick={() => setTab(value)}
                onKeyDown={(event) => {
                  const move = event.key === "ArrowRight" ? (c.ar ? -1 : 1) : event.key === "ArrowLeft" ? (c.ar ? 1 : -1) : 0;
                  if (!move && event.key !== "Home" && event.key !== "End") return;
                  event.preventDefault();
                  const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + move + tabs.length) % tabs.length;
                  setTab(tabs[next]?.value ?? "request");
                  event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
                }}
              >
                {label}
                {value === "documents" && request.documentsToReview > 0 && <span className="relocation-tab-count">{request.documentsToReview}</span>}
              </button>
            ))}
          </div>
          <div id="relocation-tab-content" role="tabpanel" aria-labelledby={`relocation-tab-${tab}`}>
            {tab === "request" && <RequestTab request={request} />}
            {tab === "documents" && <DocumentsTab request={request} report={report} />}
            {tab === "quote" && <QuoteTab request={request} report={report} />}
            {tab === "progress" && <ProgressTab request={request} />}
            {tab === "notes" && <NotesTab request={request} />}
            {tab === "history" && <HistoryTab request={request} />}
          </div>
        </>
      )}
      <ConfirmDialog request={confirming} onClose={() => setConfirming(null)} />
      <CancelRelocationDialog
        request={cancelling}
        paymentInProgress={paymentInProgress}
        onClose={() => setCancelling(null)}
        onDone={(saved) =>
          report(
            saved.refundNeeded
              ? c.text(`Request ${saved.reference} is cancelled and marked Refund needed.`, `أُلغي الطلب ${saved.reference} وعُلِّم بأنه يحتاج استرداداً.`)
              : c.text(`Request ${saved.reference} is cancelled.`, `أُلغي الطلب ${saved.reference}.`),
          )
        }
      />
      <IssueQuoteDialog
        request={quoting}
        onClose={() => setQuoting(null)}
        onDone={(saved) =>
          report(
            c.text(
              `The quote of ${formatMoney(saved.quoteDetails?.amount ?? 0, "en")} is sent. The customer gets an email with Pay now.`,
              `أُرسل عرض السعر بقيمة ${formatMoney(saved.quoteDetails?.amount ?? 0, "ar")}. يصل العميل بريد بزر الدفع.`,
            ),
          )
        }
      />
    </aside>
  );
}

// --- Request -----------------------------------------------------------------------------------------------

function RequestTab({ request }: { request: AdminRelocation }) {
  const c = useCopy();
  return (
    <>
      <section className="orders-detail-card">
        <div className="orders-detail-heading">
          <h3>{c.text("Customer", "العميل")}</h3>
          <small>{request.locale === "ar" ? c.text("Writes in Arabic", "يكتب بالعربية") : c.text("Writes in English", "يكتب بالإنجليزية")}</small>
        </div>
        <div className="orders-customer">
          <div>
            <strong>{request.contact.name}</strong>
            <p>
              <Phone size={13} />
              <bdi>{request.contact.phone}</bdi>
            </p>
            <p>
              <Mail size={13} />
              <bdi>{request.contact.email}</bdi>
            </p>
            <CustomerRecordLink email={request.contact.email} />
          </div>
        </div>
      </section>
      <section className="orders-detail-card">
        <div className="orders-detail-heading">
          <h3>{c.text("Journey", "الرحلة")}</h3>
        </div>
        <div className="orders-fulfilment">
          <Plane size={22} />
          <div>
            <strong>
              {[request.origin.city, request.origin.country].filter(Boolean).join(c.text(", ", "، "))} · {c.text("to", "إلى")} {c.local(request.destination)}
              {request.destinationOther && <small className="muted"> {c.text("(typed under Other)", "(مكتوبة تحت «أخرى»)")}</small>}
            </strong>
            <p>
              <CalendarDays size={13} />
              {request.plannedDate ? plannedLabel(request.plannedDate, c.locale) : c.text("No date given", "لم يُحدَّد تاريخ")}
            </p>
            {request.note && <p className="relocation-text">{request.note}</p>}
          </div>
        </div>
      </section>
      <section className="orders-detail-card">
        <div className="orders-detail-heading">
          <h3>{request.petDetails.length === 1 ? c.text("Pet", "الحيوان") : c.text(`Pets (${request.petDetails.length})`, `الحيوانات (${request.petDetails.length})`)}</h3>
        </div>
        {request.petDetails.map((pet) => (
          <div className="orders-fulfilment" key={pet.id}>
            <PawPrint size={22} />
            <div>
              <strong>{pet.name}</strong>
              <p>
                {[pet.petType ? c.local(pet.petType) : "", pet.breed, petAge(pet.ageMonths, c.text), pet.weightGrams === null ? "" : c.text(`${pet.weightGrams / 1000} kg`, `${pet.weightGrams / 1000} كغ`)]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {pet.microchip && (
                <p>
                  {c.text("Microchip ", "الشريحة ")}
                  <bdi dir="ltr">{pet.microchip}</bdi>
                </p>
              )}
              {pet.notes && (
                <p>
                  {c.text("Notes: ", "ملاحظات: ")}
                  {pet.notes}
                </p>
              )}
            </div>
          </div>
        ))}
      </section>
      <section className="orders-detail-card">
        <h3>{c.text("Dates", "التواريخ")}</h3>
        <dl className="orders-facts">
          <div>
            <dt>{c.text("Sent", "أُرسل")}</dt>
            <dd>{placedAt(request.placedAt, c.locale)}</dd>
          </div>
          {request.paidAt && (
            <div>
              <dt>{c.text("Paid", "دُفع")}</dt>
              <dd>{placedAt(request.paidAt, c.locale)}</dd>
            </div>
          )}
          {request.startedAt && (
            <div>
              <dt>{c.text("Started", "بدأ")}</dt>
              <dd>{placedAt(request.startedAt, c.locale)}</dd>
            </div>
          )}
          {request.completedAt && (
            <div>
              <dt>{c.text("Completed", "اكتمل")}</dt>
              <dd>{placedAt(request.completedAt, c.locale)}</dd>
            </div>
          )}
          {request.cancelledAt && (
            <div>
              <dt>{c.text("Cancelled", "أُلغي")}</dt>
              <dd>
                {placedAt(request.cancelledAt, c.locale)}
                {request.cancelledBy && ` · ${request.cancelledBy === "customer" ? c.text("by the customer", "من العميل") : c.text("by staff", "من الموظفين")}`}
                {request.cancelReason && ` · ${request.cancelReason}`}
              </dd>
            </div>
          )}
          {request.filesDeletedAt && (
            <div>
              <dt>{c.text("Files deleted", "حُذفت الملفات")}</dt>
              <dd>{placedAt(request.filesDeletedAt, c.locale)}</dd>
            </div>
          )}
        </dl>
      </section>
    </>
  );
}

// --- Documents ---------------------------------------------------------------------------------------------

function DocumentsTab({ request, report }: { request: AdminRelocation; report: (message: string, problem?: boolean) => void }) {
  const c = useCopy();
  const access = useAdminAccess();
  const canEdit = access.can("relocation", "edit") && request.actions.documents;
  const canDelete = access.can("relocation", "delete") && request.actions.documents;
  const review = useReviewRelocationDocument();
  const remove = useDeleteRelocationFile();
  const settings = useRelocationSettings(canEdit);
  const [newCopy, setNewCopy] = useState<AdminRelocationSlot | null>(null);
  const [asking, setAsking] = useState(false);
  const [confirming, setConfirming] = useState<ConfirmRequest | null>(null);
  const name = (slot: AdminRelocationSlot) => `${c.local(slot.name)}${slot.pet ? ` · ${slot.pet.name}` : ""}`;

  async function accept(slot: AdminRelocationSlot) {
    report("");
    try {
      await review.mutateAsync({ request, slotId: slot.id, outcome: "accept" });
      report(c.text(`${name(slot)} is accepted.`, `قُبل ${name(slot)}.`));
    } catch (err) {
      report(describeAdminRelocationError(err, c.text), true);
    }
  }

  function askDelete(slot: AdminRelocationSlot, file: AdminRelocationSlot["files"][number]) {
    report("");
    setConfirming({
      title: c.text(`Delete the file ${file.name}?`, `حذف الملف ${file.name}؟`),
      message: c.text(
        "The file is removed from the server now and cannot be brought back; its line stays in the list as deleted by staff. If it was the document's only file, the document goes back to Missing.",
        "يُحذف الملف من الخادم الآن ولا يمكن استرجاعه؛ ويبقى سطره في القائمة كمحذوف من الموظفين. إذا كان الملف الوحيد للمستند، يعود المستند إلى غير مرفوع.",
      ),
      confirmLabel: c.text("Delete file", "حذف الملف"),
      run: async () => {
        try {
          await remove.mutateAsync({ request, documentId: file.id });
          report(c.text(`The file of ${name(slot)} is deleted.`, `حُذف ملف ${name(slot)}.`));
        } catch (err) {
          report(describeAdminRelocationError(err, c.text), true);
        }
      },
    });
  }

  return (
    <section className="customers-section">
      <div className="orders-detail-heading">
        <h3>{c.text("Documents", "المستندات")}</h3>
        <small>
          {c.text(`${request.uploadsLeft} more files possible`, `يمكن رفع ${request.uploadsLeft} ملفاً إضافياً`)}
        </small>
      </div>
      {canEdit && (
        <div className="row">
          <button type="button" className="button button--secondary" disabled={settings.isPending} onClick={() => setAsking(true)}>
            {c.text("Ask for a document", "طلب مستند")}
          </button>
        </div>
      )}
      {request.documents.length === 0 ? (
        <p className="small muted">{c.text("No documents asked for.", "لم تُطلب مستندات.")}</p>
      ) : (
        <ul className="relocation-docs">
          {request.documents.map((slot) => (
            <li key={slot.id} className="relocation-doc">
              <div className="row spread">
                <strong>{c.local(slot.name)}</strong>
                <span className={`status status--${ADMIN_SLOT_TONE[slot.status]}`}>{c.local(ADMIN_SLOT_STATUS[slot.status])}</span>
              </div>
              <p className="small muted">
                {slot.pet ? c.text(`For ${slot.pet.name}`, `لـ ${slot.pet.name}`) : c.text("For the whole request", "للطلب كاملاً")} ·{" "}
                {slot.required ? c.text("Required", "مطلوب") : c.text("Optional", "اختياري")}
                {slot.askedBy && ` · ${c.text(`Asked by ${slot.askedBy}`, `طلبه ${slot.askedBy}`)}`}
              </p>
              {slot.askedNote && <p className="small">{slot.askedNote}</p>}
              {slot.reviewReason && (
                <p className="small">
                  {c.text("New copy asked: ", "طُلبت نسخة جديدة: ")}
                  {slot.reviewReason}
                  {slot.reviewedBy && ` · ${slot.reviewedBy}`}
                </p>
              )}
              {slot.status === "accepted" && slot.reviewedBy && slot.reviewedAt && (
                <p className="small muted">{c.text(`Accepted by ${slot.reviewedBy}, ${placedAt(slot.reviewedAt, "en")}`, `قبله ${slot.reviewedBy}، ${placedAt(slot.reviewedAt, "ar")}`)}</p>
              )}
              {slot.files.length > 0 && (
                <ul className="relocation-files">
                  {[...slot.files]
                    .sort((a, b) => b.version - a.version)
                    .map((file) => (
                      <li key={file.id} className="small">
                        <FileText size={13} aria-hidden="true" />{" "}
                        {file.deletedAt ? (
                          <span className="muted">
                            <bdi>{file.name}</bdi>{" "}
                            {file.deletedReason === "retention"
                              ? c.text("· deleted after the retention days", "· حُذف بعد أيام الاحتفاظ")
                              : c.text(`· deleted by ${file.deletedBy ?? "staff"}`, `· حذفه ${file.deletedBy ?? "الموظفون"}`)}
                          </span>
                        ) : (
                          <a href={staffRelocationFileHref(request.reference, file.id)} download={file.name} className="text-link">
                            <bdi>{file.name}</bdi>
                          </a>
                        )}
                        <span className="muted">
                          {" "}
                          · {c.text(`version ${file.version}`, `النسخة ${file.version}`)} · {fileSizeText(file.bytes, c.locale)} · {placedAt(file.uploadedAt, c.locale)}
                        </span>
                        {canDelete && !file.deletedAt && (
                          <>
                            {" "}
                            <button
                              type="button"
                              className="text-button"
                              aria-label={c.text(`Delete the file ${file.name}`, `حذف الملف ${file.name}`)}
                              onClick={() => askDelete(slot, file)}
                            >
                              {c.text("Delete", "حذف")}
                            </button>
                          </>
                        )}
                      </li>
                    ))}
                </ul>
              )}
              {canEdit && (slot.status === "uploaded" || slot.status === "accepted") && (
                <div className="row">
                  {slot.status === "uploaded" && (
                    <button type="button" className="button button--secondary" disabled={review.isPending} onClick={() => void accept(slot)} aria-label={c.text(`Accept ${name(slot)}`, `قبول ${name(slot)}`)}>
                      {c.text("Accept", "قبول")}
                    </button>
                  )}
                  <button
                    type="button"
                    className="text-button"
                    aria-label={c.text(`Ask for a new copy of ${name(slot)}`, `طلب نسخة جديدة من ${name(slot)}`)}
                    onClick={() => {
                      report("");
                      setNewCopy(slot);
                    }}
                  >
                    {c.text("Needs a new copy", "يحتاج نسخة جديدة")}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="customers-caption">
        {c.text(
          "Opening a file downloads it; every open is recorded. Files are deleted after the owner's retention days once the request ends.",
          "فتح الملف يُنزّله؛ ويُسجَّل كل فتح. تُحذف الملفات بعد أيام الاحتفاظ التي حددها المالك عند انتهاء الطلب.",
        )}
      </p>
      <NewCopyDialog
        request={request}
        slot={newCopy}
        onClose={() => setNewCopy(null)}
        onDone={() => report(c.text("A new copy is asked for. The customer gets an email.", "طُلبت نسخة جديدة. يصل العميل بريد."))}
      />
      <AskDocumentDialog
        request={request}
        open={asking}
        types={(settings.data?.documentTypes ?? []).filter((type) => type.isActive)}
        onClose={() => setAsking(false)}
        onDone={() => report(c.text("The document is asked for. The customer gets an email.", "طُلب المستند. يصل العميل بريد."))}
      />
      <ConfirmDialog request={confirming} onClose={() => setConfirming(null)} />
    </section>
  );
}

// --- Quote (and its payment) ---------------------------------------------------------------------------------

function QuoteTab({ request, report }: { request: AdminRelocation; report: (message: string, problem?: boolean) => void }) {
  const c = useCopy();
  const access = useAdminAccess();
  const canEdit = access.can("relocation", "edit");
  const canRefund = access.can("relocation", "refund");
  const [withdrawing, setWithdrawing] = useState<AdminRelocation | null>(null);
  const [paidOutside, setPaidOutside] = useState<AdminRelocation | null>(null);
  const [refundOutside, setRefundOutside] = useState<AdminRelocation | null>(null);
  const quote = request.quoteDetails;
  const outside = request.paidOutsideDetails;
  const refunded = request.refundedOutside;

  return (
    <>
      <section className="orders-detail-card orders-summary">
        <div className="orders-detail-heading">
          <h3>{c.text("Quote", "عرض السعر")}</h3>
          {quote && <small>{c.text(`Sent by ${quote.issuedBy ?? "staff"}, ${placedAt(quote.issuedAt, "en")}`, `أرسله ${quote.issuedBy ?? "الموظفون"}، ${placedAt(quote.issuedAt, "ar")}`)}</small>}
        </div>
        {quote ? (
          <>
            <dl>
              <div className="orders-summary-total">
                <dt>{c.text("Amount", "المبلغ")}</dt>
                <dd>
                  <bdi>{formatMoney(quote.amount, c.locale)}</bdi>
                </dd>
              </div>
            </dl>
            <p className="small relocation-text">{quote.note}</p>
          </>
        ) : (
          <p className="small muted">{c.text("No quote yet. Issue one from the buttons at the top.", "لا يوجد عرض سعر بعد. أصدره من الأزرار في الأعلى.")}</p>
        )}
        <div className="row">
          {canEdit && request.actions.withdrawQuote && (
            <button
              type="button"
              className="button button--secondary"
              onClick={() => {
                report("");
                setWithdrawing(request);
              }}
            >
              {c.text("Withdraw quote", "سحب عرض السعر")}
            </button>
          )}
          {canRefund && request.actions.recordPaidOutside && (
            <button
              type="button"
              className="button button--secondary"
              onClick={() => {
                report("");
                setPaidOutside(request);
              }}
            >
              {c.text("Record a payment made outside the website", "تسجيل دفعة تمت خارج الموقع")}
            </button>
          )}
        </div>
      </section>
      {outside && (
        <section className="orders-detail-card">
          <h3>{c.text("Paid outside the website", "مدفوع خارج الموقع")}</h3>
          <dl className="orders-facts">
            <div>
              <dt>{c.text("Amount", "المبلغ")}</dt>
              <dd>
                <bdi>{formatMoney(outside.amount, c.locale)}</bdi> · {c.local(PAID_OUTSIDE_METHOD[outside.method])}
              </dd>
            </div>
            <div>
              <dt>{c.text("Reference", "المرجع")}</dt>
              <dd>
                <bdi>{outside.reference}</bdi>
              </dd>
            </div>
            <div>
              <dt>{c.text("Recorded", "سُجّل")}</dt>
              <dd>
                {placedAt(outside.at, c.locale)}
                {outside.by && ` · ${outside.by}`}
              </dd>
            </div>
            {outside.note && (
              <div>
                <dt>{c.text("Note", "ملاحظة")}</dt>
                <dd>{outside.note}</dd>
              </div>
            )}
          </dl>
          {refunded && (
            <p className="small">
              {c.text(`Refunded outside the website: ${formatMoney(refunded.amount, "en")}`, `مسترد خارج الموقع: ${formatMoney(refunded.amount, "ar")}`)} ·{" "}
              <bdi>{refunded.reference}</bdi> · {placedAt(refunded.at, c.locale)}
              {refunded.by && ` · ${refunded.by}`}
            </p>
          )}
          {canRefund && request.actions.recordRefundOutside && (
            <div className="row">
              <button
                type="button"
                className="button button--secondary"
                onClick={() => {
                  report("");
                  setRefundOutside(request);
                }}
              >
                {c.text("Record a refund made outside the website", "تسجيل استرداد تم خارج الموقع")}
              </button>
            </div>
          )}
        </section>
      )}
      <PaymentsPanel
        payable={{ kind: "relocation", reference: request.reference }}
        module="relocation"
        // The quote is the one line: a refund can be filled from what was paid for it.
        refundItems={quote ? [{ key: "quote", label: c.text("Quote", "عرض السعر"), quantity: 1, paid: quote.amount }] : []}
      />
      <WithdrawQuoteDialog
        request={withdrawing}
        onClose={() => setWithdrawing(null)}
        onDone={(saved) => report(c.text(`The quote is withdrawn; request ${saved.reference} is back Under review.`, `سُحب عرض السعر؛ عاد الطلب ${saved.reference} إلى قيد المراجعة.`))}
      />
      <PaidOutsideDialog
        request={paidOutside}
        onClose={() => setPaidOutside(null)}
        onDone={(saved) => report(c.text(`Request ${saved.reference} is recorded as paid outside the website.`, `سُجّل الطلب ${saved.reference} كمدفوع خارج الموقع.`))}
      />
      <RefundOutsideDialog
        request={refundOutside}
        onClose={() => setRefundOutside(null)}
        onDone={() => report(c.text("The refund outside the website is recorded. The customer gets an email.", "سُجّل الاسترداد خارج الموقع. يصل العميل بريد."))}
      />
    </>
  );
}

// --- Progress updates (the customer sees them) and notes (staff only) -----------------------------------------------

function ProgressTab({ request }: { request: AdminRelocation }) {
  const c = useCopy();
  const access = useAdminAccess();
  const add = useAddRelocationUpdate();
  const remove = useDeleteRelocationUpdate();
  return (
    <Entries
      title={c.text("Updates for the customer", "تحديثات للعميل")}
      caption={c.text(
        "The customer sees each update on their request page and gets it by email.",
        "يرى العميل كل تحديث في صفحة طلبه ويصله بالبريد.",
      )}
      fieldLabel={c.text("New update", "تحديث جديد")}
      addLabel={c.text("Send update", "إرسال التحديث")}
      empty={c.text("No updates yet.", "لا توجد تحديثات بعد.")}
      maxLength={RELOCATION_LIMITS.maxUpdateChars}
      entries={request.updates}
      canAdd={access.can("relocation", "edit") && request.status !== "cancelled"}
      canDelete={access.can("relocation", "delete")}
      deleteTitle={c.text("Delete this update?", "حذف هذا التحديث؟")}
      deleteMessage={c.text(
        "It disappears from the customer's request page. The email already sent is not taken back.",
        "يختفي من صفحة طلب العميل. لا يُسترجع البريد المرسل.",
      )}
      onAdd={(text) => add.mutateAsync({ request, text })}
      onDelete={(id) => remove.mutateAsync({ request, updateId: id })}
      busy={add.isPending || remove.isPending}
    />
  );
}

function NotesTab({ request }: { request: AdminRelocation }) {
  const c = useCopy();
  const access = useAdminAccess();
  const add = useAddRelocationNote();
  const remove = useDeleteRelocationNote();
  return (
    <Entries
      title={c.text("Notes", "الملاحظات")}
      caption={c.text("For staff only: the customer never sees notes.", "للموظفين فقط: لا يرى العميل الملاحظات.")}
      fieldLabel={c.text("New note", "ملاحظة جديدة")}
      addLabel={c.text("Add note", "إضافة الملاحظة")}
      empty={c.text("No notes yet.", "لا توجد ملاحظات بعد.")}
      maxLength={RELOCATION_LIMITS.maxInternalNoteChars}
      entries={request.notes}
      canAdd={access.can("relocation", "edit")}
      canDelete={access.can("relocation", "delete")}
      deleteTitle={c.text("Delete this note?", "حذف هذه الملاحظة؟")}
      deleteMessage={c.text("The note is removed for everyone and cannot be brought back.", "تُحذف الملاحظة للجميع ولا يمكن استرجاعها.")}
      onAdd={(text) => add.mutateAsync({ request, text })}
      onDelete={(id) => remove.mutateAsync({ request, noteId: id })}
      busy={add.isPending || remove.isPending}
    />
  );
}

/** A list of short texts with an add form, newest first (updates and notes share it). */
function Entries({
  title,
  caption,
  fieldLabel,
  addLabel,
  empty,
  maxLength,
  entries,
  canAdd,
  canDelete,
  deleteTitle,
  deleteMessage,
  onAdd,
  onDelete,
  busy,
}: {
  title: string;
  caption: string;
  fieldLabel: string;
  addLabel: string;
  empty: string;
  maxLength: number;
  entries: readonly { id: string; text: string; at: string; by: string | null }[];
  canAdd: boolean;
  canDelete: boolean;
  deleteTitle: string;
  deleteMessage: string;
  onAdd: (text: string) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
  busy: boolean;
}) {
  const c = useCopy();
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirming, setConfirming] = useState<ConfirmRequest | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const value = text.trim();
    if (!value) {
      setError(c.text("Please write the text.", "يرجى كتابة النص."));
      return;
    }
    setError("");
    setNotice("");
    try {
      await onAdd(value);
      setText("");
      setNotice(c.text("Added.", "أُضيف."));
    } catch (err) {
      setError(describeAdminRelocationError(err, c.text));
    }
  }

  return (
    <section className="customers-section">
      <h3>{title}</h3>
      <p className="customers-caption">{caption}</p>
      {canAdd && (
        <form className="form-stack customers-note-form" onSubmit={submit}>
          <Field label={fieldLabel}>
            <textarea maxLength={maxLength} rows={3} value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
          <div className="row">
            <button type="submit" className="button button--primary" disabled={busy}>
              {addLabel}
            </button>
          </div>
        </form>
      )}
      <ErrorMessage message={error} />
      <p role="status" className="small">
        {notice}
      </p>
      {entries.length === 0 ? (
        <p className="small muted">{empty}</p>
      ) : (
        <ul className="customers-notes">
          {[...entries]
            .sort((a, b) => b.at.localeCompare(a.at))
            .map((entry) => (
              <li key={entry.id} className="customers-note">
                <div>
                  <p className="relocation-text">{entry.text}</p>
                  <small>
                    {entry.by ?? c.text("Staff", "الموظفون")} · {placedAt(entry.at, c.locale)}
                  </small>
                </div>
                {canDelete && (
                  <button
                    type="button"
                    className="text-button"
                    disabled={busy}
                    aria-label={c.text(`Delete the entry of ${placedAt(entry.at, "en")}`, `حذف إدخال ${placedAt(entry.at, "ar")}`)}
                    onClick={() => {
                      setError("");
                      setNotice("");
                      setConfirming({
                        title: deleteTitle,
                        message: deleteMessage,
                        confirmLabel: c.text("Delete", "حذف"),
                        run: async () => {
                          try {
                            await onDelete(entry.id);
                            setNotice(c.text("Deleted.", "حُذف."));
                          } catch (err) {
                            setError(describeAdminRelocationError(err, c.text));
                          }
                        },
                      });
                    }}
                  >
                    {c.text("Delete", "حذف")}
                  </button>
                )}
              </li>
            ))}
        </ul>
      )}
      <ConfirmDialog request={confirming} onClose={() => setConfirming(null)} />
    </section>
  );
}

// --- History ------------------------------------------------------------------------------------------------

const ACTOR: Readonly<Record<AdminRelocation["history"][number]["actor"], { en: string; ar: string }>> = {
  customer: { en: "Customer", ar: "العميل" },
  staff: { en: "Staff", ar: "الموظفون" },
  system: { en: "Automatic", ar: "تلقائي" },
};

function HistoryTab({ request }: { request: AdminRelocation }) {
  const c = useCopy();
  return (
    <section className="customers-section">
      <h3>{c.text("History", "السجل")}</h3>
      <ol className="orders-history">
        {request.history.map((entry) => (
          <li key={`${entry.at}-${entry.to}-${entry.reason ?? ""}`}>
            <strong>
              {entry.from && entry.from !== entry.to ? `${c.local(ADMIN_RELOCATION_STATUS[entry.from])} → ` : ""}
              {c.local(ADMIN_RELOCATION_STATUS[entry.to])}
            </strong>
            <span className="small muted">
              {" · "}
              {entry.staffName ?? c.local(ACTOR[entry.actor])}
              {" · "}
              <time dateTime={entry.at}>{placedAt(entry.at, c.locale)}</time>
            </span>
            {entry.reason && <p className="small">{entry.reason}</p>}
          </li>
        ))}
      </ol>
    </section>
  );
}
