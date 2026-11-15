"use client";

import { type AdminCrmTag, type AdminCustomer, CRM_LIMITS, CRM_TAG_COLOURS, type CrmTag, type CrmTagColour } from "@nennus-catio/contracts";
import { type FormEvent, useState } from "react";
import { useAdminAccess } from "@/shared/access/AdminAccess";
import { describeAdminCustomerError, useCrmTags, useDeleteCrmTag, useSaveCrmTag, useSetCustomerTags } from "@/shared/api/admin-customers";
import { useCopy } from "@/shared/lib/copy";
import { ErrorMessage, Field, Modal } from "@/shared/ui/BusinessUI";
import { ConfirmDialog, type ConfirmRequest } from "@/shared/ui/ConfirmDialog";
import { customerLabel, TAG_COLOURS } from "../lib/customer-labels";

/**
 * Customer tags (10d; D186 question 5): the chips, a customer's tag editor and the owner's tag list.
 * The editor is a normal edit form (Save replaces the customer's tags, version-checked); deleting a tag
 * from the list asks first and says how many customers lose it (D128).
 */

export function TagChip({ tag }: { tag: CrmTag }) {
  const c = useCopy();
  return <span className={`customers-tag customers-tag--${tag.colour}`}>{c.local(tag.name)}</span>;
}

/** The tags on one customer: tick the ones they should have, then save. */
export function CustomerTagsDialog({
  customer,
  onClose,
  onSaved,
}: {
  customer: AdminCustomer | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  // Keyed by the customer only: a reload after someone else's change keeps the ticks and brings the new version.
  return customer ? <TagEditor key={customer.id} customer={customer} onClose={onClose} onSaved={onSaved} /> : null;
}

function TagEditor({ customer, onClose, onSaved }: { customer: AdminCustomer; onClose: () => void; onSaved: (message: string) => void }) {
  const c = useCopy();
  const tags = useCrmTags();
  const save = useSetCustomerTags();
  const [selected, setSelected] = useState(() => new Set(customer.tags.map((tag) => tag.id)));
  const [error, setError] = useState("");
  const list = tags.data?.tags ?? [];
  const label = customerLabel(customer);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const tagIds = list.filter((tag) => selected.has(tag.id)).map((tag) => tag.id);
    if (tagIds.length > CRM_LIMITS.maxTagsPerCustomer) {
      setError(
        c.text(`A customer can have up to ${CRM_LIMITS.maxTagsPerCustomer} tags.`, `يمكن أن يحمل العميل ${CRM_LIMITS.maxTagsPerCustomer} وسماً كحد أقصى.`),
      );
      return;
    }
    setError("");
    try {
      await save.mutateAsync({ customer, tagIds });
      onSaved(c.text(`The tags of ${label} are saved.`, `حُفظت وسوم ${label}.`));
      onClose();
    } catch (err) {
      setError(describeAdminCustomerError(err, c.text));
    }
  }

  return (
    <Modal
      open
      onOpenChange={(open) => !open && !save.isPending && onClose()}
      title={c.text(`Tags for ${label}`, `وسوم ${label}`)}
      description={c.text(
        "Tick the tags this customer should have. Saving replaces their tags; the customer never sees them.",
        "اختر الوسوم التي يجب أن يحملها هذا العميل. الحفظ يستبدل وسومه؛ ولا يراها العميل.",
      )}
    >
      <form className="form-stack" onSubmit={submit}>
        {tags.isPending && (
          <p className="muted" role="status" aria-busy="true">
            {c.text("Loading the tags…", "جارٍ تحميل الوسوم…")}
          </p>
        )}
        {tags.isError && <ErrorMessage message={describeAdminCustomerError(tags.error, c.text)} />}
        {tags.data && list.length === 0 && (
          <p className="muted">
            {c.text(
              "No tags yet. Use Manage tags on the Customers page to add the tags your team uses.",
              "لا توجد وسوم بعد. استخدم «إدارة الوسوم» في صفحة العملاء لإضافة الوسوم التي يستخدمها فريقك.",
            )}
          </p>
        )}
        {list.length > 0 && (
          <fieldset className="customers-tag-choices">
            <legend className="sr-only">{c.text("Tags", "الوسوم")}</legend>
            {list.map((tag) => (
              <label key={tag.id} className="row">
                <input
                  type="checkbox"
                  checked={selected.has(tag.id)}
                  onChange={(e) =>
                    setSelected((current) => {
                      const next = new Set(current);
                      if (e.target.checked) next.add(tag.id);
                      else next.delete(tag.id);
                      return next;
                    })
                  }
                />
                <TagChip tag={tag} />
              </label>
            ))}
          </fieldset>
        )}
        <ErrorMessage message={error} />
        <div className="row confirm-actions">
          <button type="button" className="button button--secondary" disabled={save.isPending} onClick={onClose}>
            {c.text("Cancel", "إلغاء")}
          </button>
          <button type="submit" className="button button--primary" disabled={save.isPending || !tags.data}>
            {c.text("Save tags", "حفظ الوسوم")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

const EMPTY_FORM = { en: "", ar: "", colour: "grey" as CrmTagColour };

/** The owner's tag list: Create/Edit adds and edits; Delete deletes (asks first). */
export function ManageTagsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const c = useCopy();
  const access = useAdminAccess();
  const canEdit = access.can("customers", "edit");
  const canDelete = access.can("customers", "delete");
  const tags = useCrmTags({ enabled: open });
  const save = useSaveCrmTag();
  const remove = useDeleteCrmTag();
  const [editing, setEditing] = useState<AdminCrmTag | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirming, setConfirming] = useState<ConfirmRequest | null>(null);
  const list = tags.data?.tags ?? [];
  const customersText = (count: number) => c.text(`${count} customer${count === 1 ? "" : "s"}`, `${count} عميل`);

  function edit(tag: AdminCrmTag | null) {
    setEditing(tag);
    setForm(tag ? { en: tag.name.en, ar: tag.name.ar, colour: tag.colour } : EMPTY_FORM);
    setError("");
    setNotice("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const name = { en: form.en.trim(), ar: form.ar.trim() };
    if (!name.en || !name.ar) {
      setError(c.text("Please give the tag a name in English and in Arabic.", "يرجى كتابة اسم الوسم بالإنجليزية والعربية."));
      return;
    }
    setError("");
    try {
      const saved = await save.mutateAsync({ tag: editing, body: { name, colour: form.colour, sortOrder: editing?.sortOrder ?? 0 } });
      setNotice(editing ? c.text(`Tag "${saved.name.en}" saved.`, `حُفظ الوسم «${saved.name.ar}».`) : c.text(`Tag "${saved.name.en}" added.`, `أُضيف الوسم «${saved.name.ar}».`));
      edit(null);
    } catch (err) {
      setError(describeAdminCustomerError(err, c.text));
    }
  }

  function askDelete(tag: AdminCrmTag) {
    setError("");
    setNotice("");
    const name = c.local(tag.name);
    setConfirming({
      title: c.text(`Delete the tag "${name}"?`, `حذف الوسم «${name}»؟`),
      message:
        tag.customers === 0
          ? c.text("No customer has it. This cannot be undone.", "لا يحمله أي عميل. لا يمكن التراجع عن ذلك.")
          : c.text(
              `It comes off ${customersText(tag.customers)}. This cannot be undone.`,
              `سيُزال عن ${customersText(tag.customers)}. لا يمكن التراجع عن ذلك.`,
            ),
      confirmLabel: c.text("Delete tag", "حذف الوسم"),
      run: async () => {
        try {
          await remove.mutateAsync({ tag });
          if (editing?.id === tag.id) edit(null);
          setNotice(c.text(`Tag "${tag.name.en}" deleted.`, `حُذف الوسم «${tag.name.ar}».`));
        } catch (err) {
          setError(describeAdminCustomerError(err, c.text));
        }
      },
    });
  }

  return (
    <Modal
      open={open}
      onOpenChange={(next) => !next && !save.isPending && onClose()}
      title={c.text("Customer tags", "وسوم العملاء")}
      description={c.text(
        `The tags your team can put on customers, up to ${CRM_LIMITS.maxTags}. Each name is used once in each language. Customers never see tags.`,
        `الوسوم التي يمكن لفريقك وضعها على العملاء، حتى ${CRM_LIMITS.maxTags}. يُستخدم كل اسم مرة واحدة في كل لغة. لا يرى العملاء الوسوم.`,
      )}
    >
      <div className="form-stack">
        {tags.isPending && (
          <p className="muted" role="status" aria-busy="true">
            {c.text("Loading the tags…", "جارٍ تحميل الوسوم…")}
          </p>
        )}
        {tags.isError && <ErrorMessage message={describeAdminCustomerError(tags.error, c.text)} />}
        {tags.data && list.length === 0 && <p className="muted">{c.text("No tags yet.", "لا توجد وسوم بعد.")}</p>}
        {list.length > 0 && (
          <ul className="customers-tag-list">
            {list.map((tag) => (
              <li key={tag.id}>
                <TagChip tag={tag} />
                <small>{customersText(tag.customers)}</small>
                {canEdit && (
                  <button type="button" className="text-button" aria-label={c.text(`Edit ${c.local(tag.name)}`, `تعديل ${c.local(tag.name)}`)} onClick={() => edit(tag)}>
                    {c.text("Edit", "تعديل")}
                  </button>
                )}
                {canDelete && (
                  <button
                    type="button"
                    className="text-button"
                    aria-label={c.text(`Delete ${c.local(tag.name)}`, `حذف ${c.local(tag.name)}`)}
                    disabled={remove.isPending}
                    onClick={() => askDelete(tag)}
                  >
                    {c.text("Delete", "حذف")}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        <p role="status" className="small">
          {notice}
        </p>
        {canEdit && (
          <form className="form-stack customers-tag-form" onSubmit={submit}>
            <h3>{editing ? c.text(`Edit "${c.local(editing.name)}"`, `تعديل «${c.local(editing.name)}»`) : c.text("Add a tag", "إضافة وسم")}</h3>
            <Field label={c.text("English name", "الاسم بالإنجليزية")}>
              <input maxLength={CRM_LIMITS.maxTagNameLength} dir="ltr" value={form.en} onChange={(e) => setForm({ ...form, en: e.target.value })} />
            </Field>
            <Field label={c.text("Arabic name", "الاسم بالعربية")}>
              <input maxLength={CRM_LIMITS.maxTagNameLength} dir="rtl" value={form.ar} onChange={(e) => setForm({ ...form, ar: e.target.value })} />
            </Field>
            <Field label={c.text("Colour", "اللون")}>
              <select value={form.colour} onChange={(e) => setForm({ ...form, colour: e.target.value as CrmTagColour })}>
                {CRM_TAG_COLOURS.map((colour) => (
                  <option key={colour} value={colour}>
                    {c.local(TAG_COLOURS[colour])}
                  </option>
                ))}
              </select>
            </Field>
            <ErrorMessage message={error} />
            <div className="row">
              {editing && (
                <button type="button" className="button button--secondary" disabled={save.isPending} onClick={() => edit(null)}>
                  {c.text("Cancel edit", "إلغاء التعديل")}
                </button>
              )}
              <button type="submit" className="button button--primary" disabled={save.isPending}>
                {editing ? c.text("Save tag", "حفظ الوسم") : c.text("Add tag", "إضافة الوسم")}
              </button>
            </div>
          </form>
        )}
        {!canEdit && <ErrorMessage message={error} />}
        {/* Inside the dialog, so the question opens on top of it rather than closing it. */}
        <ConfirmDialog request={confirming} onClose={() => setConfirming(null)} />
      </div>
    </Modal>
  );
}
