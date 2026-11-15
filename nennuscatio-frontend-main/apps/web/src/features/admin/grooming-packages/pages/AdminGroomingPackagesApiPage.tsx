"use client";

import type { AdminGroomingGroup, AdminGroomingPackage } from "@nennus-catio/contracts";
import { type FormEvent, useState } from "react";
import { useAdminAccess } from "@/shared/access/AdminAccess";
import {
  describeGroomingError,
  useAdminGroomingGroups,
  useDeleteGroomingGroup,
  useDeleteGroomingPackage,
  useSaveGroomingGroup,
  useSaveGroomingPackage,
} from "@/shared/api/grooming";
import { useCopy } from "@/shared/lib/copy";
import { AdminPage, ErrorMessage, Field, Modal } from "@/shared/ui/BusinessUI";
import { CatalogState } from "@/shared/ui/CatalogState";
import { ConfirmDialog, type ConfirmRequest } from "@/shared/ui/ConfirmDialog";
import { ImagePicker } from "@/shared/ui/ImagePicker";
import {
  type GroupDraft,
  groupDraft,
  groupRequest,
  type PackageDraft,
  packageDraft,
  packageRequest,
  rangeText,
} from "../lib/grooming-form";
import { NumberInput } from "@/shared/ui/NumberInput";

const GROOMING_UPLOAD = "/api/admin/grooming/media";

/**
 * The owner's grooming pet groups and packages (9a, D159-D160; permission "groomingPackages"): add,
 * edit, hide and delete both. Deleting a group deletes its packages with it (D260), and the question
 * names them; hiding and deleting ask first (D128). Bookings keep their own copy of a package, so
 * changes apply to new bookings only.
 */
export function AdminGroomingPackagesApiPage() {
  const c = useCopy();
  const access = useAdminAccess();
  const canEdit = access.can("groomingPackages", "edit");
  const canDelete = access.can("groomingPackages", "delete");
  const list = useAdminGroomingGroups();
  const saveGroup = useSaveGroomingGroup();
  const removeGroup = useDeleteGroomingGroup();
  const savePackage = useSaveGroomingPackage();
  const removePackage = useDeleteGroomingPackage();
  const [groupForm, setGroupForm] = useState<GroupDraft | null>(null);
  const [packageForm, setPackageForm] = useState<PackageDraft | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirming, setConfirming] = useState<ConfirmRequest | null>(null);

  const page = (body: React.ReactNode) => (
    <AdminPage
      module="groomingPackages"
      title={c.text("Grooming packages", "باقات العناية")}
      subtitle={c.text(
        "Pet groups and their packages. Customers see groups that are on and have at least one package that is on, in this order. Bookings keep their own copy, so changes apply to new bookings only.",
        "فئات الحيوانات وباقاتها. يرى العملاء الفئات المفعّلة التي فيها باقة مفعّلة واحدة على الأقل، بهذا الترتيب. يحتفظ كل حجز بنسخته، لذا تنطبق التغييرات على الحجوزات الجديدة فقط.",
      )}
    >
      {body}
    </AdminPage>
  );

  if (list.isPending || list.isError) {
    return page(<CatalogState status={list.isPending ? "loading" : "error"} retry={() => void list.refetch()} />);
  }
  const groups = list.data;
  const nextGroupOrder = Math.max(-1, ...groups.map((group) => group.sortOrder)) + 1;
  const nextPackageOrder = (groupId: string) =>
    Math.max(-1, ...(groups.find((group) => group.id === groupId)?.packages.map((item) => item.sortOrder) ?? [])) + 1;
  const minutesText = (minutes: number) => c.text(`${minutes} min`, `${minutes} دقيقة`);

  function report(message: string) {
    setNotice(message);
    setError("");
  }

  function openGroup(group: AdminGroomingGroup | null) {
    setError("");
    setNotice("");
    setGroupForm(groupDraft(group, nextGroupOrder));
  }

  function openPackage(item: AdminGroomingPackage | null, groupId: string) {
    setError("");
    setNotice("");
    setPackageForm(packageDraft(item, groupId, nextPackageOrder(groupId)));
  }

  async function submitGroup(event: FormEvent) {
    event.preventDefault();
    if (!groupForm) return;
    const request = groupRequest(groupForm);
    if ("invalid" in request) {
      setError(
        request.invalid === "age"
          ? c.text("Enter ages as whole months (for example 12 for one year), or leave them empty.", "أدخل الأعمار بالأشهر الكاملة (مثلاً 12 لسنة واحدة)، أو اتركها فارغة.")
          : c.text("Enter weights in kg above 0 (for example 2.5), or leave them empty.", "أدخل الأوزان بالكيلوغرام أكبر من 0 (مثلاً 2.5)، أو اتركها فارغة."),
      );
      return;
    }
    const draft = groupForm;
    const group = draft.group;
    // Hiding a group hides all of its packages from customers, so it asks first (D128).
    if (group?.active && !draft.active) {
      setConfirming({
        title: c.text(`Hide the pet group "${group.name.en}"?`, `إخفاء فئة «${group.name.ar}»؟`),
        message: c.text(
          "Customers will no longer see it or any of its packages, so they cannot book them. Bookings already made stay. You can show it again later.",
          "لن يرى العملاء الفئة أو أي من باقاتها، فلا يمكنهم حجزها. تبقى الحجوزات القائمة. يمكنك إظهارها لاحقاً.",
        ),
        confirmLabel: c.text("Hide group", "إخفاء الفئة"),
        run: () => persistGroup(draft, request),
      });
      return;
    }
    await persistGroup(draft, request);
  }

  async function persistGroup(draft: GroupDraft, request: Exclude<ReturnType<typeof groupRequest>, { invalid: unknown }>) {
    try {
      await saveGroup.mutateAsync({ group: draft.group, request });
      setGroupForm(null);
      report(c.text(`Pet group "${request.name.en}" saved.`, `حُفظت فئة «${request.name.ar}».`));
    } catch (err) {
      setError(describeGroomingError(err, c.text));
    }
  }

  async function submitPackage(event: FormEvent) {
    event.preventDefault();
    if (!packageForm) return;
    const request = packageRequest(packageForm);
    if ("invalid" in request) {
      setError(
        request.invalid === "price"
          ? c.text("Enter a price above 0 in QAR, for example 120 or 120.50.", "أدخل سعراً أكبر من 0 بالريال القطري، مثل 120 أو 120.50.")
          : request.invalid === "minutes"
            ? c.text("Enter the length in minutes, from 15 to 240.", "أدخل المدة بالدقائق، من 15 إلى 240.")
            : c.text(
                "Enter the POS item code as it is there: letters, digits, dots, dashes or underscores, starting with a letter or digit, up to 60. Leave it empty if there is none.",
                "أدخل رمز الصنف كما هو في نظام نقطة البيع: أحرف أو أرقام أو نقاط أو شرطات أو شرطات سفلية، يبدأ بحرف أو رقم، حتى 60 حرفاً. اتركه فارغاً إن لم يوجد.",
              ),
      );
      return;
    }
    const draft = packageForm;
    const item = draft.item;
    if (item?.active && !draft.active) {
      setConfirming({
        title: c.text(`Hide the package "${item.name.en}"?`, `إخفاء باقة «${item.name.ar}»؟`),
        message: c.text(
          "Customers will no longer see it, so they cannot book it. Bookings already made stay. You can show it again later.",
          "لن يرى العملاء الباقة، فلا يمكنهم حجزها. تبقى الحجوزات القائمة. يمكنك إظهارها لاحقاً.",
        ),
        confirmLabel: c.text("Hide package", "إخفاء الباقة"),
        run: () => persistPackage(draft, request),
      });
      return;
    }
    await persistPackage(draft, request);
  }

  async function persistPackage(draft: PackageDraft, request: Exclude<ReturnType<typeof packageRequest>, { invalid: unknown }>) {
    try {
      await savePackage.mutateAsync({ item: draft.item, request });
      setPackageForm(null);
      report(c.text(`Package "${request.name.en}" saved.`, `حُفظت باقة «${request.name.ar}».`));
    } catch (err) {
      setError(describeGroomingError(err, c.text));
    }
  }

  /** A group goes with its packages (D260); the question names them and what happens to bookings and offers. */
  function askDeleteGroup(group: AdminGroomingGroup) {
    setNotice("");
    const count = group.packages.length;
    const names = group.packages.map((item) => c.local(item.name)).join(c.text(", ", "، "));
    setConfirming({
      title: c.text(`Delete the pet group "${group.name.en}"?`, `حذف فئة «${group.name.ar}»؟`),
      message:
        count === 0
          ? c.text("It has no packages. This cannot be undone.", "لا توجد بها باقات. لا يمكن التراجع عن ذلك.")
          : c.text(
              `${count === 1 ? "Its package is" : `Its ${count} packages are`} deleted with it: ${names}. Customers can no longer book ${count === 1 ? "it" : "them"}. Bookings already made keep their own copy. A promotion that chose only ${count === 1 ? "this package" : "these packages"} will no longer apply. This cannot be undone. To stop offering the group for a while, hide it instead.`,
              `تُحذف معها باقاتها (${count}): ${names}. لن يتمكن العملاء من حجزها. تحتفظ الحجوزات القائمة بنسختها. العرض الذي اختار هذه الباقات فقط لن يُطبَّق بعد ذلك. لا يمكن التراجع عن ذلك. لإيقاف الفئة مؤقتاً، أخفِها بدلاً من ذلك.`,
            ),
      confirmLabel: c.text("Delete group", "حذف الفئة"),
      run: async () => {
        try {
          await removeGroup.mutateAsync(group);
          report(
            count === 0
              ? c.text(`Pet group "${group.name.en}" deleted.`, `حُذفت فئة «${group.name.ar}».`)
              : c.text(
                  `Pet group "${group.name.en}" and ${count === 1 ? "its package" : `its ${count} packages`} deleted.`,
                  `حُذفت فئة «${group.name.ar}» وباقاتها.`,
                ),
          );
        } catch (err) {
          setError(describeGroomingError(err, c.text));
        }
      },
    });
  }

  function askDeletePackage(item: AdminGroomingPackage) {
    setNotice("");
    setConfirming({
      title: c.text(`Delete the package "${item.name.en}"?`, `حذف باقة «${item.name.ar}»؟`),
      message: c.text(
        "Customers can no longer book it. Bookings already made keep their own copy. This cannot be undone. To stop offering it for a while, edit it and hide it instead.",
        "لن يتمكن العملاء من حجزها. تحتفظ الحجوزات القائمة بنسختها. لا يمكن التراجع عن ذلك. لإيقافها مؤقتاً، عدّلها وأخفها بدلاً من ذلك.",
      ),
      confirmLabel: c.text("Delete package", "حذف الباقة"),
      run: async () => {
        try {
          await removePackage.mutateAsync(item);
          report(c.text(`Package "${item.name.en}" deleted.`, `حُذفت باقة «${item.name.ar}».`));
        } catch (err) {
          setError(describeGroomingError(err, c.text));
        }
      },
    });
  }

  return page(
    <section className="panel form-stack" aria-label={c.text("Pet groups and packages", "فئات الحيوانات والباقات")}>
      <div className="row delivery-panel-head">
        <p className="small muted">
          {c.text(
            "Each group can say which pets it is for by age; an empty limit is not checked. Add a group when a different size or age needs a different price, and say the size in its name or its “who it is for” text.",
            "يمكن لكل فئة تحديد الحيوانات المناسبة لها حسب العمر؛ لا يُتحقق من الحد الفارغ. أضف فئة عندما يحتاج حجم أو عمر مختلف إلى سعر مختلف، واذكر الحجم في اسمها أو في نص «لمن هذه الفئة».",
          )}
        </p>
        {canEdit && (
          <div className="row">
            <button type="button" className="button button--secondary" onClick={() => openGroup(null)}>
              {c.text("Add pet group", "إضافة فئة")}
            </button>
            <button type="button" className="button button--secondary" disabled={groups.length === 0} onClick={() => openPackage(null, groups[0]?.id ?? "")}>
              {c.text("Add package", "إضافة باقة")}
            </button>
          </div>
        )}
      </div>
      <ErrorMessage message={groupForm || packageForm ? "" : error} />
      <p role="status" className="small">
        {notice}
      </p>
      {groups.length === 0 && (
        <p className="empty">{c.text("No pet groups yet. Add a group first, then its packages.", "لا توجد فئات بعد. أضف فئة أولاً ثم باقاتها.")}</p>
      )}
      {groups.map((group) => {
        // The weight is no longer asked or checked (D246): only the age limits are shown.
        const age = rangeText(group.ageMonths, "months", c.text);
        return (
          <section key={group.id} className="delivery-city" aria-label={c.local(group.name)}>
            <div className="row delivery-city__head">
              <div>
                <h3 className="delivery-date">{c.local(group.name)}</h3>
                <span className="small muted">
                  {c.local(group.audience) || c.text("No “who it is for” text yet", "لا يوجد وصف للفئة بعد")}
                  {age && ` · ${c.text("Age", "العمر")}: ${age}`}
                  {!group.active && ` · ${c.text("Hidden", "مخفية")}`}
                  {group.isSample && ` · ${c.text("Sample", "مثال")}`}
                </span>
              </div>
              <div className="row">
                {canEdit && (
                  <button type="button" className="text-button" aria-label={`${c.text("Edit group", "تعديل الفئة")} ${c.local(group.name)}`} onClick={() => openGroup(group)}>
                    {c.text("Edit group", "تعديل الفئة")}
                  </button>
                )}
                {canEdit && (
                  <button type="button" className="text-button" aria-label={`${c.text("Add package in", "إضافة باقة في")} ${c.local(group.name)}`} onClick={() => openPackage(null, group.id)}>
                    {c.text("Add package", "إضافة باقة")}
                  </button>
                )}
                {canDelete && (
                  <button type="button" className="text-button" aria-label={`${c.text("Delete group", "حذف الفئة")} ${c.local(group.name)}`} onClick={() => askDeleteGroup(group)}>
                    {c.text("Delete", "حذف")}
                  </button>
                )}
              </div>
            </div>
            {group.packages.length === 0 ? (
              <p className="small muted">{c.text("No packages yet: customers do not see this group.", "لا توجد باقات بعد: لا يرى العملاء هذه الفئة.")}</p>
            ) : (
              <ul className="role-list">
                {group.packages.map((item) => (
                  <li key={item.id}>
                    <div>
                      <strong>{c.local(item.name)}</strong>
                      <span className="small muted">
                        {" · "}
                        {c.money(item.price)}
                        {" · "}
                        {minutesText(item.durationMinutes)}
                        {!item.active && ` · ${c.text("Hidden", "مخفية")}`}
                        {item.isSample && ` · ${c.text("Sample", "مثال")}`}
                      </span>
                    </div>
                    <div className="row">
                      {canEdit && (
                        <button type="button" className="text-button" aria-label={`${c.text("Edit", "تعديل")} ${c.local(item.name)} · ${c.local(group.name)}`} onClick={() => openPackage(item, group.id)}>
                          {c.text("Edit", "تعديل")}
                        </button>
                      )}
                      {canDelete && (
                        <button type="button" className="text-button" aria-label={`${c.text("Delete", "حذف")} ${c.local(item.name)} · ${c.local(group.name)}`} onClick={() => askDeletePackage(item)}>
                          {c.text("Delete", "حذف")}
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}

      <Modal
        open={groupForm !== null}
        onOpenChange={(value) => !value && setGroupForm(null)}
        title={groupForm?.group ? c.text("Edit pet group", "تعديل الفئة") : c.text("New pet group", "فئة جديدة")}
        description={c.text(
          "Age limits are optional. When set, a pet outside them cannot be booked in this group.",
          "حدود العمر اختيارية. عند تحديدها لا يمكن حجز حيوان خارجها في هذه الفئة.",
        )}
      >
        {groupForm && (
          <form className="form-stack" onSubmit={submitGroup}>
            <div className="form-two">
              <Field label={c.text("Name · English", "الاسم · الإنجليزية")}>
                <input required maxLength={80} value={groupForm.nameEn} onChange={(e) => setGroupForm({ ...groupForm, nameEn: e.target.value })} />
              </Field>
              <Field label={c.text("Name · Arabic", "الاسم · العربية")}>
                <input required maxLength={80} dir="rtl" value={groupForm.nameAr} onChange={(e) => setGroupForm({ ...groupForm, nameAr: e.target.value })} />
              </Field>
            </div>
            <div className="form-two">
              <Field label={c.text("Who it is for · English", "لمن هذه الفئة · الإنجليزية")}>
                <textarea maxLength={300} value={groupForm.audienceEn} onChange={(e) => setGroupForm({ ...groupForm, audienceEn: e.target.value })} />
              </Field>
              <Field label={c.text("Who it is for · Arabic", "لمن هذه الفئة · العربية")}>
                <textarea maxLength={300} dir="rtl" value={groupForm.audienceAr} onChange={(e) => setGroupForm({ ...groupForm, audienceAr: e.target.value })} />
              </Field>
            </div>
            <div className="form-two">
              <Field label={c.text("Youngest age (months, empty = no limit)", "أصغر عمر (بالأشهر، فارغ = بلا حد)")}>
                <NumberInput dir="ltr" value={groupForm.minAge} onChange={(e) => setGroupForm({ ...groupForm, minAge: e.target.value })} />
              </Field>
              <Field label={c.text("Oldest age (months, empty = no limit)", "أكبر عمر (بالأشهر، فارغ = بلا حد)")}>
                <NumberInput dir="ltr" value={groupForm.maxAge} onChange={(e) => setGroupForm({ ...groupForm, maxAge: e.target.value })} />
              </Field>
            </div>
            {/* The weight limits are hidden (D246): the booking no longer asks the weight. A save sends
                the stored values back unchanged, so they stay if they are ever needed again. */}
            <Field label={c.text("Order in lists (smaller first)", "الترتيب في القوائم (الأصغر أولاً)")}>
              <NumberInput min={0} max={1000} required value={groupForm.sortOrder} onChange={(e) => setGroupForm({ ...groupForm, sortOrder: Number(e.target.value) })} />
            </Field>
            <label className="row">
              <input type="checkbox" checked={groupForm.active} onChange={(e) => setGroupForm({ ...groupForm, active: e.target.checked })} />
              {c.text("Show this group to customers", "عرض هذه الفئة للعملاء")}
            </label>
            <ErrorMessage message={error} />
            <div className="row">
              <button type="button" className="button button--secondary" onClick={() => setGroupForm(null)}>
                {c.text("Cancel", "إلغاء")}
              </button>
              <button type="submit" className="button button--primary" disabled={saveGroup.isPending}>
                {saveGroup.isPending ? c.text("Saving…", "جارٍ الحفظ…") : c.text("Save group", "احفظ الفئة")}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        open={packageForm !== null}
        onOpenChange={(value) => !value && setPackageForm(null)}
        title={packageForm?.item ? c.text("Edit package", "تعديل الباقة") : c.text("New package", "باقة جديدة")}
        description={c.text(
          "Bookings already made keep their own copy of the package, price and length.",
          "تحتفظ الحجوزات القائمة بنسختها من الباقة والسعر والمدة.",
        )}
      >
        {packageForm && (
          <form className="form-stack" onSubmit={submitPackage}>
            <Field label={c.text("Pet group", "الفئة")}>
              <select required value={packageForm.groupId} onChange={(e) => setPackageForm({ ...packageForm, groupId: e.target.value })}>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {c.local(group.name)}
                    {!group.active && ` (${c.text("hidden", "مخفية")})`}
                  </option>
                ))}
              </select>
            </Field>
            <div className="form-two">
              <Field label={c.text("Name · English", "الاسم · الإنجليزية")}>
                <input required maxLength={120} value={packageForm.nameEn} onChange={(e) => setPackageForm({ ...packageForm, nameEn: e.target.value })} />
              </Field>
              <Field label={c.text("Name · Arabic", "الاسم · العربية")}>
                <input required maxLength={120} dir="rtl" value={packageForm.nameAr} onChange={(e) => setPackageForm({ ...packageForm, nameAr: e.target.value })} />
              </Field>
            </div>
            <div className="form-two">
              <Field label={c.text("Description · English", "الوصف · الإنجليزية")}>
                <textarea maxLength={2000} value={packageForm.descriptionEn} onChange={(e) => setPackageForm({ ...packageForm, descriptionEn: e.target.value })} />
              </Field>
              <Field label={c.text("Description · Arabic", "الوصف · العربية")}>
                <textarea maxLength={2000} dir="rtl" value={packageForm.descriptionAr} onChange={(e) => setPackageForm({ ...packageForm, descriptionAr: e.target.value })} />
              </Field>
            </div>
            <div className="form-two">
              <Field label={c.text("What is included · English (one per line)", "ما تشمله · الإنجليزية (سطر لكل بند)")}>
                <textarea value={packageForm.includedEn} onChange={(e) => setPackageForm({ ...packageForm, includedEn: e.target.value })} />
              </Field>
              <Field label={c.text("What is included · Arabic (one per line)", "ما تشمله · العربية (سطر لكل بند)")}>
                <textarea dir="rtl" value={packageForm.includedAr} onChange={(e) => setPackageForm({ ...packageForm, includedAr: e.target.value })} />
              </Field>
            </div>
            <div className="form-two">
              <Field label={c.text("Price (QAR)", "السعر (ر.ق)")}>
                <NumberInput kind="decimal" required dir="ltr" value={packageForm.priceQar} onChange={(e) => setPackageForm({ ...packageForm, priceQar: e.target.value })} />
              </Field>
              <Field label={c.text("Length (minutes, 15-240)", "المدة (بالدقائق، 15-240)")}>
                <NumberInput required dir="ltr" value={packageForm.minutes} onChange={(e) => setPackageForm({ ...packageForm, minutes: e.target.value })} />
              </Field>
            </div>
            <ImagePicker value={packageForm.image} onChange={(image) => setPackageForm({ ...packageForm, image })} onError={setError} uploadPath={GROOMING_UPLOAD} />
            <Field label={c.text("POS item code (optional; bookings carry it to the POS)", "رمز الصنف في نقطة البيع (اختياري؛ ترسله الحجوزات إلى نظام نقطة البيع)")}>
              <input maxLength={60} dir="ltr" autoComplete="off" spellCheck={false} value={packageForm.code} onChange={(e) => setPackageForm({ ...packageForm, code: e.target.value })} />
            </Field>
            <Field label={c.text("Order in its group (smaller first)", "الترتيب داخل الفئة (الأصغر أولاً)")}>
              <NumberInput min={0} max={1000} required value={packageForm.sortOrder} onChange={(e) => setPackageForm({ ...packageForm, sortOrder: Number(e.target.value) })} />
            </Field>
            <label className="row">
              <input type="checkbox" checked={packageForm.active} onChange={(e) => setPackageForm({ ...packageForm, active: e.target.checked })} />
              {c.text("Offer this package to customers", "عرض هذه الباقة للعملاء")}
            </label>
            <ErrorMessage message={error} />
            <div className="row">
              <button type="button" className="button button--secondary" onClick={() => setPackageForm(null)}>
                {c.text("Cancel", "إلغاء")}
              </button>
              <button type="submit" className="button button--primary" disabled={savePackage.isPending}>
                {savePackage.isPending ? c.text("Saving…", "جارٍ الحفظ…") : c.text("Save package", "احفظ الباقة")}
              </button>
            </div>
          </form>
        )}
      </Modal>
      <ConfirmDialog request={confirming} onClose={() => setConfirming(null)} />
    </section>,
  );
}
