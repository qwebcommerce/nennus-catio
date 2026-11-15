"use client";

import type { AdminGroomingArea, AdminGroomingCity } from "@nennus-catio/contracts";
import { type FormEvent, useState } from "react";
import { parseQar, qarInput } from "@/features/admin/orders/lib/payment-labels";
import { useAdminAccess } from "@/shared/access/AdminAccess";
import { describeGroomingError } from "@/shared/api/grooming";
import { useGroomingAreas, useSaveGroomingAreaFee, useSaveGroomingCityFee } from "@/shared/api/grooming-calendar";
import { useCopy } from "@/shared/lib/copy";
import { ErrorMessage, Field, Modal } from "@/shared/ui/BusinessUI";
import { CatalogState } from "@/shared/ui/CatalogState";
import { ConfirmDialog, type ConfirmRequest } from "@/shared/ui/ConfirmDialog";
import { NumberInput } from "@/shared/ui/NumberInput";

type Draft =
  | { kind: "city"; city: AdminGroomingCity; feeQar: string; enabled: boolean }
  | { kind: "area"; area: AdminGroomingArea; followsCity: boolean; feeQar: string; enabled: boolean };

/**
 * Home visit fees (9b; plan question 3, D112, D114): each city has a fee its areas follow unless an
 * area has its own, and a switch for home visits there; separate from the delivery fees and switches.
 * The areas themselves are managed in Delivery. Switching home visits off asks first (D128).
 */
export function GroomingFeesPanel() {
  const c = useCopy();
  const access = useAdminAccess();
  const canEdit = access.can("groomingCalendar", "edit");
  const list = useGroomingAreas();
  const saveCity = useSaveGroomingCityFee();
  const saveArea = useSaveGroomingAreaFee();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState<ConfirmRequest | null>(null);

  if (list.isPending || list.isError) {
    return <CatalogState status={list.isPending ? "loading" : "error"} retry={() => void list.refetch()} />;
  }
  const { cities, areas } = list.data;
  const feeText = (minor: number) => (minor === 0 ? c.text("No visit fee", "بلا رسوم زيارة") : c.money(minor));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    const current = draft;
    const fee = current.kind === "area" && current.followsCity ? null : parseQar(current.feeQar);
    if (!(current.kind === "area" && current.followsCity) && fee === null) {
      setError(c.text("Enter the fee in QAR, for example 50 or 50.50.", "أدخل الرسوم بالريال القطري، مثل 50 أو 50.50."));
      return;
    }
    const wasOn = current.kind === "city" ? current.city.enabled : current.area.enabled;
    if (wasOn && !current.enabled) {
      const name = current.kind === "city" ? current.city.name : current.area.name;
      setConfirming({
        title: c.text(`Stop home visits in ${name.en}?`, `إيقاف الزيارات المنزلية في ${name.ar}؟`),
        message: c.text(
          current.kind === "city"
            ? "Customers will no longer be able to book home grooming in any of its areas. Bookings already made stay. Deliveries are not affected."
            : "Customers will no longer be able to book home grooming in this area. Bookings already made stay. Deliveries are not affected.",
          current.kind === "city"
            ? "لن يتمكن العملاء من حجز العناية المنزلية في أي من مناطقها. تبقى الحجوزات القائمة. لا يتأثر التوصيل."
            : "لن يتمكن العملاء من حجز العناية المنزلية في هذه المنطقة. تبقى الحجوزات القائمة. لا يتأثر التوصيل.",
        ),
        confirmLabel: c.text("Stop home visits", "إيقاف الزيارات"),
        run: () => persist(current, fee),
      });
      return;
    }
    await persist(current, fee);
  }

  async function persist(current: Draft, fee: number | null) {
    try {
      if (current.kind === "city") await saveCity.mutateAsync({ city: current.city, fee: fee ?? 0, enabled: current.enabled });
      else await saveArea.mutateAsync({ area: current.area, fee, enabled: current.enabled });
      setDraft(null);
      setError("");
    } catch (err) {
      setError(describeGroomingError(err, c.text));
    }
  }

  return (
    <section className="panel form-stack" aria-label={c.text("Home visit fees", "رسوم الزيارات المنزلية")}>
      <p className="small muted">
        {c.text(
          "A home visit costs the package price plus the area's visit fee. Each city has one fee for its areas; give an area its own fee when it should cost something different, for example far areas. These are separate from delivery fees. Areas are added in Delivery.",
          "تكلفة الزيارة المنزلية سعر الباقة مع رسوم زيارة المنطقة. لكل مدينة رسوم واحدة لمناطقها؛ أعطِ المنطقة رسوماً خاصة إذا كان يجب أن تختلف، مثل المناطق البعيدة. هذه منفصلة عن رسوم التوصيل. تُضاف المناطق من قسم التوصيل.",
        )}
      </p>
      <ErrorMessage message={draft ? "" : error} />
      {cities.length === 0 && <p className="empty">{c.text("No cities yet. Add them in Delivery first.", "لا توجد مدن بعد. أضفها من قسم التوصيل أولاً.")}</p>}
      {cities.map((city) => {
        const inCity = areas.filter((area) => area.cityId === city.id);
        return (
          <section key={city.id} className="delivery-city" aria-label={c.local(city.name)}>
            <div className="row delivery-city__head">
              <div>
                <h3 className="delivery-date">{c.local(city.name)}</h3>
                <span className="small muted">
                  {c.text("City visit fee: ", "رسوم زيارة المدينة: ")}
                  {feeText(city.fee)}
                  {!city.enabled && ` · ${c.text("Home visits stopped", "الزيارات المنزلية متوقفة")}`}
                </span>
              </div>
              {canEdit && (
                <button
                  type="button"
                  className="text-button"
                  aria-label={`${c.text("Edit visit fee for", "تعديل رسوم الزيارة لـ")} ${c.local(city.name)}`}
                  onClick={() => {
                    setError("");
                    setDraft({ kind: "city", city, feeQar: qarInput(city.fee), enabled: city.enabled });
                  }}
                >
                  {c.text("Edit", "تعديل")}
                </button>
              )}
            </div>
            {inCity.length > 0 && (
              <ul className="role-list">
                {inCity.map((area) => (
                  <li key={area.id}>
                    <div>
                      <strong>{c.local(area.name)}</strong>
                      <span className="small muted">
                        {" · "}
                        {feeText(area.fee)}
                        {" · "}
                        {area.ownFee === null ? c.text(`${city.name.en} fee`, `رسوم ${city.name.ar}`) : c.text("own fee", "رسوم خاصة")}
                        {!area.offered && ` · ${c.text("No home visits", "لا زيارات منزلية")}`}
                      </span>
                    </div>
                    {canEdit && (
                      <button
                        type="button"
                        className="text-button"
                        aria-label={`${c.text("Edit visit fee for", "تعديل رسوم الزيارة لـ")} ${c.local(area.name)}`}
                        onClick={() => {
                          setError("");
                          setDraft({ kind: "area", area, followsCity: area.ownFee === null, feeQar: qarInput(area.ownFee ?? area.fee), enabled: area.enabled });
                        }}
                      >
                        {c.text("Edit", "تعديل")}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}

      <Modal
        open={draft !== null}
        onOpenChange={(value) => !value && setDraft(null)}
        title={
          draft
            ? c.text(`Home visits in ${(draft.kind === "city" ? draft.city.name : draft.area.name).en}`, `الزيارات المنزلية في ${(draft.kind === "city" ? draft.city.name : draft.area.name).ar}`)
            : ""
        }
        description={c.text("New bookings use the new fee; bookings already made keep theirs.", "تستخدم الحجوزات الجديدة الرسوم الجديدة؛ وتحتفظ الحجوزات القائمة برسومها.")}
      >
        {draft && (
          <form className="form-stack" onSubmit={submit}>
            {draft.kind === "area" && (
              <label className="row">
                <input type="checkbox" checked={draft.followsCity} onChange={(e) => setDraft({ ...draft, followsCity: e.target.checked })} />
                {c.text(`Use the ${draft.area.city.en} fee`, `استخدام رسوم ${draft.area.city.ar}`)}
              </label>
            )}
            {!(draft.kind === "area" && draft.followsCity) && (
              <Field label={c.text("Visit fee (QAR, 0 = none)", "رسوم الزيارة (ر.ق، 0 = بلا)")}>
                <NumberInput kind="decimal" required dir="ltr" value={draft.feeQar} onChange={(e) => setDraft({ ...draft, feeQar: e.target.value })} />
              </Field>
            )}
            <label className="row">
              <input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} />
              {draft.kind === "city" ? c.text("Offer home visits in this city", "عرض الزيارات المنزلية في هذه المدينة") : c.text("Offer home visits in this area", "عرض الزيارات المنزلية في هذه المنطقة")}
            </label>
            <ErrorMessage message={error} />
            <div className="row">
              <button type="button" className="button button--secondary" onClick={() => setDraft(null)}>
                {c.text("Cancel", "إلغاء")}
              </button>
              <button type="submit" className="button button--primary" disabled={saveCity.isPending || saveArea.isPending}>
                {c.text("Save", "احفظ")}
              </button>
            </div>
          </form>
        )}
      </Modal>
      <ConfirmDialog request={confirming} onClose={() => setConfirming(null)} />
    </section>
  );
}
