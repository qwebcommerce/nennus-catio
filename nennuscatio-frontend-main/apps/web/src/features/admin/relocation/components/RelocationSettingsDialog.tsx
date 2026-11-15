"use client";

import { RELOCATION_LIMITS, type RelocationDestination, type RelocationDocumentType, type RelocationSettings } from "@nennus-catio/contracts";
import { type FormEvent, useState } from "react";
import { useAdminAccess } from "@/shared/access/AdminAccess";
import { describeAdminRelocationError, useChangeRelocationSettings, useRelocationSettings } from "@/shared/api/admin-relocation";
import { useCopy } from "@/shared/lib/copy";
import { ErrorMessage, Field, Modal } from "@/shared/ui/BusinessUI";
import { ConfirmDialog, type ConfirmRequest } from "@/shared/ui/ConfirmDialog";
import { NumberInput } from "@/shared/ui/NumberInput";

type Report = (message: string, problem?: boolean) => void;

/**
 * The owner's relocation settings (15d; plan section 4.7, D279 answers 3, 5, 8 and 14): the document
 * types and destinations the request form offers, how many days files are kept after a request ends, and
 * where the staff alerts go. Deleting asks first (D128); a type or destination a request already used is
 * switched off instead, so that request keeps its words (each request also keeps its own copy).
 */
export function RelocationSettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return open ? <SettingsBody onClose={onClose} /> : null;
}

function SettingsBody({ onClose }: { onClose: () => void }) {
  const c = useCopy();
  const settings = useRelocationSettings();
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const report: Report = (message, problem = false) => {
    setNotice(problem ? "" : message);
    setError(problem ? message : "");
  };
  const data = settings.data;
  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title={c.text("Relocation settings", "إعدادات النقل")}
      description={c.text(
        "What the request form offers, how long files are kept, and where staff alerts go. A change applies to new requests: each request keeps its own copy.",
        "ما يعرضه نموذج الطلب، ومدة الاحتفاظ بالملفات، ووجهة تنبيهات الموظفين. ينطبق التغيير على الطلبات الجديدة: يحتفظ كل طلب بنسخته.",
      )}
    >
      <div className="form-stack relocation-settings">
        {settings.isPending && (
          <p className="muted" role="status" aria-busy="true">
            {c.text("Loading the settings…", "جارٍ تحميل الإعدادات…")}
          </p>
        )}
        {settings.isError && (
          <div className="inline-state" role="alert">
            <p>{describeAdminRelocationError(settings.error, c.text)}</p>
            <button type="button" className="button button--secondary" onClick={() => void settings.refetch()}>
              {c.text("Retry", "أعد المحاولة")}
            </button>
          </div>
        )}
        <ErrorMessage message={error} />
        <p role="status" className="small">
          {notice}
        </p>
        {data && (
          <>
            <GeneralForm key={data.version} settings={data} report={report} />
            <TypesList types={data.documentTypes} report={report} />
            <DestinationsList destinations={data.destinations} report={report} />
          </>
        )}
        <div className="row confirm-actions">
          <button type="button" className="button button--secondary" onClick={onClose}>
            {c.text("Close", "إغلاق")}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function GeneralForm({ settings, report }: { settings: RelocationSettings; report: Report }) {
  const c = useCopy();
  const canEdit = useAdminAccess().can("relocation", "edit");
  const change = useChangeRelocationSettings();
  const [days, setDays] = useState(String(settings.retentionDays));
  const [email, setEmail] = useState(settings.alertEmail ?? "");

  async function submit(event: FormEvent) {
    event.preventDefault();
    const retentionDays = Number(days);
    if (!/^\d+$/.test(days.trim()) || retentionDays < RELOCATION_LIMITS.minRetentionDays || retentionDays > RELOCATION_LIMITS.maxRetentionDays) {
      report(c.text("Keep files for 1 to 3,650 days.", "احتفظ بالملفات من ١ إلى ٣٬٦٥٠ يوماً."), true);
      return;
    }
    try {
      await change.mutateAsync({ kind: "settings", body: { version: settings.version, retentionDays, alertEmail: email.trim() || null } });
      report(c.text("Settings saved.", "حُفظت الإعدادات."));
    } catch (err) {
      report(describeAdminRelocationError(err, c.text), true);
    }
  }

  return (
    <form className="form-stack" onSubmit={submit}>
      <h3>{c.text("Files and alerts", "الملفات والتنبيهات")}</h3>
      <div className="form-two">
        <Field label={c.text("Days to keep files after a request ends", "أيام الاحتفاظ بالملفات بعد انتهاء الطلب")}>
          <NumberInput dir="ltr" value={days} onChange={(e) => setDays(e.target.value)} min={1} max={3650} maxLength={4} disabled={!canEdit} />
        </Field>
        <Field label={c.text("Alert email for new requests, uploads and payments (empty: none)", "بريد التنبيهات للطلبات الجديدة والملفات والمدفوعات (فارغ: لا شيء)")}>
          <input type="email" dir="ltr" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} disabled={!canEdit} />
        </Field>
      </div>
      {canEdit && (
        <div className="row">
          <button type="submit" className="button button--primary" disabled={change.isPending}>
            {c.text("Save", "حفظ")}
          </button>
        </div>
      )}
    </form>
  );
}

// --- Document types ---------------------------------------------------------------------------------------

function TypesList({ types, report }: { types: readonly RelocationDocumentType[]; report: Report }) {
  const c = useCopy();
  const access = useAdminAccess();
  const canEdit = access.can("relocation", "edit");
  const canDelete = access.can("relocation", "delete");
  const change = useChangeRelocationSettings();
  const [editing, setEditing] = useState<RelocationDocumentType | "new" | null>(null);
  const [confirming, setConfirming] = useState<ConfirmRequest | null>(null);

  function askDelete(type: RelocationDocumentType) {
    report("");
    setConfirming({
      title: c.text(`Delete the document type "${type.name.en}"?`, `حذف نوع المستند «${type.name.ar}»؟`),
      message:
        type.used > 0
          ? c.text(
              `It was asked on ${type.used} requests, so it is switched off instead: new requests no longer ask for it, and those requests keep it.`,
              `طُلب في ${type.used} طلبات، لذا يُوقف بدلاً من حذفه: لا تطلبه الطلبات الجديدة، وتحتفظ به تلك الطلبات.`,
            )
          : c.text("New requests no longer ask for it. It is removed from the list.", "لن تطلبه الطلبات الجديدة. يُحذف من القائمة."),
      confirmLabel: type.used > 0 ? c.text("Switch off", "إيقاف") : c.text("Delete", "حذف"),
      run: async () => {
        try {
          await change.mutateAsync({ kind: "deleteType", id: type.id });
          report(type.used > 0 ? c.text("The document type is switched off.", "أُوقف نوع المستند.") : c.text("The document type is deleted.", "حُذف نوع المستند."));
        } catch (err) {
          report(describeAdminRelocationError(err, c.text), true);
        }
      },
    });
  }

  return (
    <section className="form-stack">
      <h3>{c.text("Document types", "أنواع المستندات")}</h3>
      <p className="small muted">
        {c.text(
          "Asked on every new request: once per pet, or once for the request. Nothing is needed to send a request; staff can ask for others on any request.",
          "تُطلب في كل طلب جديد: مرة لكل حيوان، أو مرة للطلب. لا يلزم شيء لإرسال الطلب؛ ويمكن للموظفين طلب غيرها في أي طلب.",
        )}
      </p>
      <ul className="relocation-settings-list">
        {types.map((type) => (
          <li key={type.id}>
            {editing !== null && editing !== "new" && editing.id === type.id ? (
              <TypeForm type={type} onDone={(message) => { setEditing(null); report(message); }} onCancel={() => setEditing(null)} report={report} />
            ) : (
              <div className="row spread">
                <span>
                  <strong>{c.local(type.name)}</strong>
                  <small className="muted">
                    {" "}
                    · {type.required ? c.text("Required", "مطلوب") : c.text("Optional", "اختياري")} ·{" "}
                    {type.perPet ? c.text("Per pet", "لكل حيوان") : c.text("Once per request", "مرة لكل طلب")}
                    {!type.isActive && ` · ${c.text("Off", "موقوف")}`}
                    {type.used > 0 && ` · ${c.text(`Used on ${type.used} requests`, `استُخدم في ${type.used} طلبات`)}`}
                  </small>
                  {type.isSample && <span className="sample-badge">{c.text("Sample", "مثال")}</span>}
                </span>
                <span className="row">
                  {canEdit && (
                    <button type="button" className="text-button" aria-label={c.text(`Edit ${type.name.en}`, `تعديل ${type.name.ar}`)} onClick={() => setEditing(type)}>
                      {c.text("Edit", "تعديل")}
                    </button>
                  )}
                  {canDelete && (
                    <button type="button" className="text-button" aria-label={c.text(`Delete ${type.name.en}`, `حذف ${type.name.ar}`)} onClick={() => askDelete(type)}>
                      {c.text("Delete", "حذف")}
                    </button>
                  )}
                </span>
              </div>
            )}
          </li>
        ))}
      </ul>
      {types.length === 0 && <p className="small muted">{c.text("No document types: requests ask for none.", "لا توجد أنواع: لا تطلب الطلبات أي مستند.")}</p>}
      {canEdit &&
        (editing === "new" ? (
          <TypeForm type={null} onDone={(message) => { setEditing(null); report(message); }} onCancel={() => setEditing(null)} report={report} />
        ) : (
          <div className="row">
            <button type="button" className="button button--secondary" onClick={() => setEditing("new")}>
              {c.text("Add a document type", "إضافة نوع مستند")}
            </button>
          </div>
        ))}
      <ConfirmDialog request={confirming} onClose={() => setConfirming(null)} />
    </section>
  );
}

function TypeForm({ type, onDone, onCancel, report }: { type: RelocationDocumentType | null; onDone: (message: string) => void; onCancel: () => void; report: Report }) {
  const c = useCopy();
  const change = useChangeRelocationSettings();
  const [nameEn, setNameEn] = useState(type?.name.en ?? "");
  const [nameAr, setNameAr] = useState(type?.name.ar ?? "");
  const [required, setRequired] = useState(type?.required ?? true);
  const [perPet, setPerPet] = useState(type?.perPet ?? true);
  const [active, setActive] = useState(type?.isActive ?? true);
  const [order, setOrder] = useState(String(type?.sortOrder ?? 0));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!nameEn.trim() || !nameAr.trim()) {
      report(c.text("Give the name in English and in Arabic.", "اكتب الاسم بالإنجليزية والعربية."), true);
      return;
    }
    const body = { name: { en: nameEn.trim(), ar: nameAr.trim() }, required, perPet, isActive: active, sortOrder: Math.min(999, Number(order) || 0) };
    try {
      await change.mutateAsync({ kind: "type", id: type?.id ?? null, body: type ? { ...body, version: type.version } : body });
      onDone(type ? c.text("The document type is saved.", "حُفظ نوع المستند.") : c.text("The document type is added.", "أُضيف نوع المستند."));
    } catch (err) {
      report(describeAdminRelocationError(err, c.text), true);
    }
  }

  return (
    <form className="form-stack relocation-settings-form" onSubmit={submit} aria-label={type ? c.text("Edit document type", "تعديل نوع المستند") : c.text("New document type", "نوع مستند جديد")}>
      <div className="form-two">
        <Field label={c.text("Name in English", "الاسم بالإنجليزية")}>
          <input dir="ltr" maxLength={80} value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
        </Field>
        <Field label={c.text("Name in Arabic", "الاسم بالعربية")}>
          <input dir="rtl" maxLength={80} value={nameAr} onChange={(e) => setNameAr(e.target.value)} />
        </Field>
      </div>
      <div className="row">
        <label className="row">
          <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
          {c.text("Required", "مطلوب")}
        </label>
        <label className="row">
          <input type="checkbox" checked={perPet} onChange={(e) => setPerPet(e.target.checked)} />
          {c.text("One per pet", "واحد لكل حيوان")}
        </label>
        <label className="row">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          {c.text("Offered on new requests", "يُطلب في الطلبات الجديدة")}
        </label>
      </div>
      <Field label={c.text("Order in the list (0 first)", "الترتيب في القائمة (٠ أولاً)")}>
        <NumberInput dir="ltr" value={order} onChange={(e) => setOrder(e.target.value)} min={0} max={999} maxLength={3} />
      </Field>
      <div className="row">
        <button type="submit" className="button button--primary" disabled={change.isPending}>
          {c.text("Save", "حفظ")}
        </button>
        <button type="button" className="text-button" disabled={change.isPending} onClick={onCancel}>
          {c.text("Cancel", "إلغاء")}
        </button>
      </div>
    </form>
  );
}

// --- Destinations ---------------------------------------------------------------------------------------

function DestinationsList({ destinations, report }: { destinations: readonly RelocationDestination[]; report: Report }) {
  const c = useCopy();
  const access = useAdminAccess();
  const canEdit = access.can("relocation", "edit");
  const canDelete = access.can("relocation", "delete");
  const change = useChangeRelocationSettings();
  const [editing, setEditing] = useState<RelocationDestination | "new" | null>(null);
  const [confirming, setConfirming] = useState<ConfirmRequest | null>(null);

  function askDelete(destination: RelocationDestination) {
    report("");
    setConfirming({
      title: c.text(`Delete the destination "${destination.name.en}"?`, `حذف الوجهة «${destination.name.ar}»؟`),
      message:
        destination.used > 0
          ? c.text(
              `${destination.used} requests chose it, so it is switched off instead: the form no longer offers it, and those requests keep it.`,
              `اختارها ${destination.used} طلبات، لذا تُوقف بدلاً من حذفها: لا يعرضها النموذج بعد الآن، وتحتفظ بها تلك الطلبات.`,
            )
          : c.text("The form no longer offers it. It is removed from the list.", "لن يعرضها النموذج. تُحذف من القائمة."),
      confirmLabel: destination.used > 0 ? c.text("Switch off", "إيقاف") : c.text("Delete", "حذف"),
      run: async () => {
        try {
          await change.mutateAsync({ kind: "deleteDestination", id: destination.id });
          report(destination.used > 0 ? c.text("The destination is switched off.", "أُوقفت الوجهة.") : c.text("The destination is deleted.", "حُذفت الوجهة."));
        } catch (err) {
          report(describeAdminRelocationError(err, c.text), true);
        }
      },
    });
  }

  return (
    <section className="form-stack">
      <h3>{c.text("Destinations", "الوجهات")}</h3>
      <p className="small muted">{c.text("Offered on the form; customers can also type another under \"Other\".", "تُعرض في النموذج؛ ويمكن للعملاء كتابة غيرها تحت «أخرى».")}</p>
      <ul className="relocation-settings-list">
        {destinations.map((destination) => (
          <li key={destination.id}>
            {editing !== null && editing !== "new" && editing.id === destination.id ? (
              <DestinationForm destination={destination} onDone={(message) => { setEditing(null); report(message); }} onCancel={() => setEditing(null)} report={report} />
            ) : (
              <div className="row spread">
                <span>
                  <strong>{c.local(destination.name)}</strong>
                  <small className="muted">
                    {c.local(destination.note) && ` · ${c.local(destination.note)}`}
                    {!destination.isActive && ` · ${c.text("Off", "موقوفة")}`}
                    {destination.used > 0 && ` · ${c.text(`Chosen on ${destination.used} requests`, `اختيرت في ${destination.used} طلبات`)}`}
                  </small>
                  {destination.isSample && <span className="sample-badge">{c.text("Sample", "مثال")}</span>}
                </span>
                <span className="row">
                  {canEdit && (
                    <button type="button" className="text-button" aria-label={c.text(`Edit ${destination.name.en}`, `تعديل ${destination.name.ar}`)} onClick={() => setEditing(destination)}>
                      {c.text("Edit", "تعديل")}
                    </button>
                  )}
                  {canDelete && (
                    <button type="button" className="text-button" aria-label={c.text(`Delete ${destination.name.en}`, `حذف ${destination.name.ar}`)} onClick={() => askDelete(destination)}>
                      {c.text("Delete", "حذف")}
                    </button>
                  )}
                </span>
              </div>
            )}
          </li>
        ))}
      </ul>
      {destinations.length === 0 && <p className="small muted">{c.text("No destinations: customers type theirs under \"Other\".", "لا توجد وجهات: يكتب العملاء وجهتهم تحت «أخرى».")}</p>}
      {canEdit &&
        (editing === "new" ? (
          <DestinationForm destination={null} onDone={(message) => { setEditing(null); report(message); }} onCancel={() => setEditing(null)} report={report} />
        ) : (
          <div className="row">
            <button type="button" className="button button--secondary" onClick={() => setEditing("new")}>
              {c.text("Add a destination", "إضافة وجهة")}
            </button>
          </div>
        ))}
      <ConfirmDialog request={confirming} onClose={() => setConfirming(null)} />
    </section>
  );
}

function DestinationForm({
  destination,
  onDone,
  onCancel,
  report,
}: {
  destination: RelocationDestination | null;
  onDone: (message: string) => void;
  onCancel: () => void;
  report: Report;
}) {
  const c = useCopy();
  const change = useChangeRelocationSettings();
  const [nameEn, setNameEn] = useState(destination?.name.en ?? "");
  const [nameAr, setNameAr] = useState(destination?.name.ar ?? "");
  const [noteEn, setNoteEn] = useState(destination?.note.en ?? "");
  const [noteAr, setNoteAr] = useState(destination?.note.ar ?? "");
  const [active, setActive] = useState(destination?.isActive ?? true);
  const [order, setOrder] = useState(String(destination?.sortOrder ?? 0));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!nameEn.trim() || !nameAr.trim()) {
      report(c.text("Give the name in English and in Arabic.", "اكتب الاسم بالإنجليزية والعربية."), true);
      return;
    }
    const body = {
      name: { en: nameEn.trim(), ar: nameAr.trim() },
      note: { en: noteEn.trim(), ar: noteAr.trim() },
      isActive: active,
      sortOrder: Math.min(999, Number(order) || 0),
    };
    try {
      await change.mutateAsync({ kind: "destination", id: destination?.id ?? null, body: destination ? { ...body, version: destination.version } : body });
      onDone(destination ? c.text("The destination is saved.", "حُفظت الوجهة.") : c.text("The destination is added.", "أُضيفت الوجهة."));
    } catch (err) {
      report(describeAdminRelocationError(err, c.text), true);
    }
  }

  return (
    <form className="form-stack relocation-settings-form" onSubmit={submit} aria-label={destination ? c.text("Edit destination", "تعديل الوجهة") : c.text("New destination", "وجهة جديدة")}>
      <div className="form-two">
        <Field label={c.text("Name in English", "الاسم بالإنجليزية")}>
          <input dir="ltr" maxLength={80} value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
        </Field>
        <Field label={c.text("Name in Arabic", "الاسم بالعربية")}>
          <input dir="rtl" maxLength={80} value={nameAr} onChange={(e) => setNameAr(e.target.value)} />
        </Field>
        <Field label={c.text("Note in English (optional)", "ملاحظة بالإنجليزية (اختيارية)")}>
          <input dir="ltr" maxLength={300} value={noteEn} onChange={(e) => setNoteEn(e.target.value)} />
        </Field>
        <Field label={c.text("Note in Arabic (optional)", "ملاحظة بالعربية (اختيارية)")}>
          <input dir="rtl" maxLength={300} value={noteAr} onChange={(e) => setNoteAr(e.target.value)} />
        </Field>
      </div>
      <label className="row">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        {c.text("Offered on the form", "تُعرض في النموذج")}
      </label>
      <Field label={c.text("Order in the list (0 first)", "الترتيب في القائمة (٠ أولاً)")}>
        <NumberInput dir="ltr" value={order} onChange={(e) => setOrder(e.target.value)} min={0} max={999} maxLength={3} />
      </Field>
      <div className="row">
        <button type="submit" className="button button--primary" disabled={change.isPending}>
          {c.text("Save", "حفظ")}
        </button>
        <button type="button" className="text-button" disabled={change.isPending} onClick={onCancel}>
          {c.text("Cancel", "إلغاء")}
        </button>
      </div>
    </form>
  );
}
