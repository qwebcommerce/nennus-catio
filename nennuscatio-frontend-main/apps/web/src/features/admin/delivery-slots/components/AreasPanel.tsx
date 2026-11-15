"use client";

import type { AdminDeliveryArea, AdminDeliveryCity } from "@nennus-catio/contracts";
import { type FormEvent, useState } from "react";
import {
  describeDeliveryError,
  useDeleteArea,
  useDeleteCity,
  useDeliveryAreas,
  useSaveArea,
  useSaveCity,
} from "@/shared/api/admin-delivery";
import { useAdminAccess } from "@/shared/access/AdminAccess";
import { useCopy } from "@/shared/lib/copy";
import { ErrorMessage, Field, Modal } from "@/shared/ui/BusinessUI";
import { CatalogState } from "@/shared/ui/CatalogState";
import { ConfirmDialog, type ConfirmRequest } from "@/shared/ui/ConfirmDialog";
import { NumberInput } from "@/shared/ui/NumberInput";

type CityDraft = { city: AdminDeliveryCity | null; en: string; ar: string; feeQar: string; sortOrder: number; active: boolean };
type AreaDraft = {
  area: AdminDeliveryArea | null;
  en: string;
  ar: string;
  cityId: string;
  followsCity: boolean;
  feeQar: string;
  sortOrder: number;
  active: boolean;
};

/** QAR text ("15", "15.5", "15.50") → minor units; null when it is not a valid amount. */
export function parseQar(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(trimmed)) return null;
  return Math.round(Number(trimmed) * 100);
}

const qarText = (minor: number) => (minor / 100).toFixed(2).replace(/\.00$/, "");

/**
 * Cities, their areas and the delivery fees (D117, D135). Each city has a fee that its areas follow
 * unless an area has its own fee, and a switch that stops deliveries to all of its areas. Customers
 * pick an area under its city at checkout. Hidden areas are not offered. Sample areas are examples.
 */
export function AreasPanel() {
  const c = useCopy();
  const access = useAdminAccess();
  const canEdit = access.can("deliverySlots", "edit");
  const canDelete = access.can("deliverySlots", "delete");
  const list = useDeliveryAreas();
  const saveCity = useSaveCity();
  const removeCity = useDeleteCity();
  const saveArea = useSaveArea();
  const removeArea = useDeleteArea();
  const [cityDraft, setCityDraft] = useState<CityDraft | null>(null);
  const [areaDraft, setAreaDraft] = useState<AreaDraft | null>(null);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState<ConfirmRequest | null>(null);

  if (list.isPending || list.isError) {
    return <CatalogState status={list.isPending ? "loading" : "error"} retry={() => void list.refetch()} />;
  }
  const { cities, areas } = list.data;
  const feeText = (minor: number) => (minor === 0 ? c.text("Free delivery", "توصيل مجاني") : c.money(minor));
  const following = (cityId: string) => areas.filter((area) => area.cityId === cityId && area.ownFee === null).length;
  const areaCount = (n: number) => c.text(n === 1 ? "1 area" : `${n} areas`, n === 1 ? "منطقة واحدة" : `${n} مناطق`);

  function editCity(city: AdminDeliveryCity | null) {
    setError("");
    setCityDraft(
      city
        ? { city, en: city.name.en, ar: city.name.ar, feeQar: qarText(city.fee), sortOrder: city.sortOrder, active: city.active }
        : { city: null, en: "", ar: "", feeQar: "0", sortOrder: (cities.length + 1) * 10, active: true },
    );
  }

  function editArea(area: AdminDeliveryArea | null, cityId = cities[0]?.id ?? "") {
    setError("");
    setAreaDraft(
      area
        ? {
            area,
            en: area.name.en,
            ar: area.name.ar,
            cityId: area.cityId,
            followsCity: area.ownFee === null,
            feeQar: qarText(area.ownFee ?? area.fee),
            sortOrder: area.sortOrder,
            active: area.active,
          }
        : { area: null, en: "", ar: "", cityId, followsCity: true, feeQar: "0", sortOrder: 500, active: true },
    );
  }

  async function submitCity(event: FormEvent) {
    event.preventDefault();
    if (!cityDraft) return;
    const fee = parseQar(cityDraft.feeQar);
    if (fee === null) {
      setError(c.text("Enter the fee in QAR, for example 15 or 15.50.", "أدخل الرسوم بالريال القطري، مثل 15 أو 15.50."));
      return;
    }
    const draft = cityDraft;
    const city = draft.city;
    // Switching a city off stops all of its areas at once, so it asks first (D128).
    if (city?.active && !draft.active) {
      setConfirming({
        title: c.text(`Stop deliveries to ${city.name.en}?`, `إيقاف التوصيل إلى ${city.name.ar}؟`),
        message: c.text(
          `Customers will no longer be able to choose ${city.areaCount === 1 ? "its area" : `any of its ${city.areaCount} areas`} at checkout. Orders already placed stay. You can switch it back on later.`,
          `لن يتمكن العملاء من اختيار أي منطقة فيها (${areaCount(city.areaCount)}) عند الدفع. تبقى الطلبات المرسلة. يمكنك إعادة التشغيل لاحقاً.`,
        ),
        confirmLabel: c.text("Stop deliveries", "إيقاف التوصيل"),
        run: () => persistCity(draft, fee),
      });
      return;
    }
    await persistCity(draft, fee);
  }

  async function persistCity(draft: CityDraft, fee: number) {
    try {
      await saveCity.mutateAsync({
        city: draft.city,
        request: { name: { en: draft.en, ar: draft.ar }, fee, active: draft.active, sortOrder: draft.sortOrder },
      });
      setCityDraft(null);
      setError("");
    } catch (err) {
      setError(describeDeliveryError(err, c.text));
    }
  }

  async function submitArea(event: FormEvent) {
    event.preventDefault();
    if (!areaDraft) return;
    const fee = areaDraft.followsCity ? null : parseQar(areaDraft.feeQar);
    if (!areaDraft.followsCity && fee === null) {
      setError(c.text("Enter the fee in QAR, for example 15 or 15.50.", "أدخل الرسوم بالريال القطري، مثل 15 أو 15.50."));
      return;
    }
    try {
      await saveArea.mutateAsync({
        area: areaDraft.area,
        request: {
          name: { en: areaDraft.en, ar: areaDraft.ar },
          cityId: areaDraft.cityId,
          fee,
          active: areaDraft.active,
          sortOrder: areaDraft.sortOrder,
        },
      });
      setAreaDraft(null);
      setError("");
    } catch (err) {
      setError(describeDeliveryError(err, c.text));
    }
  }

  function askDeleteCity(city: AdminDeliveryCity) {
    setConfirming({
      title: c.text(`Delete the city "${city.name.en}"?`, `حذف المدينة «${city.name.ar}»؟`),
      message: c.text("It has no areas. This cannot be undone.", "لا توجد بها مناطق. لا يمكن التراجع عن ذلك."),
      confirmLabel: c.text("Delete city", "حذف المدينة"),
      run: async () => {
        try {
          await removeCity.mutateAsync(city);
          setError("");
        } catch (err) {
          setError(describeDeliveryError(err, c.text));
        }
      },
    });
  }

  function askDeleteArea(area: AdminDeliveryArea) {
    setConfirming({
      title: c.text(`Delete the area "${area.name.en}"?`, `حذف المنطقة «${area.name.ar}»؟`),
      message: c.text(
        "Customers will no longer be able to choose this area at checkout. This cannot be undone. To stop offering it for a while, edit it and untick \"Offer this area at checkout\" instead.",
        "لن يتمكن العملاء من اختيار هذه المنطقة عند الدفع. لا يمكن التراجع عن ذلك. لإيقافها مؤقتاً، عدّلها وأزل تحديد «عرض هذه المنطقة عند الدفع» بدلاً من ذلك.",
      ),
      confirmLabel: c.text("Delete area", "حذف المنطقة"),
      run: async () => {
        try {
          await removeArea.mutateAsync(area);
          setError("");
        } catch (err) {
          setError(describeDeliveryError(err, c.text));
        }
      },
    });
  }

  const draftCity = areaDraft ? cities.find((city) => city.id === areaDraft.cityId) : undefined;

  return (
    <section className="panel form-stack" aria-label={c.text("Delivery areas and fees", "مناطق التوصيل والرسوم")}>
      <div className="row delivery-panel-head">
        <p className="small muted">
          {c.text(
            "Customers choose their area under its city at checkout. Each city has one fee for its areas; give an area its own fee when it should cost something different. Use 0 for free delivery.",
            "يختار العملاء منطقتهم تحت مدينتها عند الدفع. لكل مدينة رسوم واحدة لمناطقها؛ أعطِ المنطقة رسوماً خاصة إذا كان يجب أن تختلف. استخدم 0 للتوصيل المجاني.",
          )}
        </p>
        {canEdit && (
          <div className="row">
            <button type="button" className="button button--secondary" onClick={() => editCity(null)}>
              {c.text("Add city", "إضافة مدينة")}
            </button>
            <button type="button" className="button button--secondary" disabled={!cities.length} onClick={() => editArea(null)}>
              {c.text("Add area", "إضافة منطقة")}
            </button>
          </div>
        )}
      </div>
      <ErrorMessage message={cityDraft || areaDraft ? "" : error} />
      {cities.length === 0 && (
        <p className="empty">{c.text("No cities yet. Add a city first, then its areas.", "لا توجد مدن بعد. أضف مدينة أولاً ثم مناطقها.")}</p>
      )}
      {cities.map((city) => {
        const inCity = areas.filter((area) => area.cityId === city.id);
        return (
          <section key={city.id} className="delivery-city" aria-label={c.local(city.name)}>
            <div className="row delivery-city__head">
              <div>
                <h3 className="delivery-date">{c.local(city.name)}</h3>
                <span className="small muted">
                  {c.text("City fee: ", "رسوم المدينة: ")}
                  {feeText(city.fee)}
                  {" · "}
                  {areaCount(city.areaCount)}
                  {!city.active && ` · ${c.text("Deliveries stopped", "التوصيل متوقف")}`}
                </span>
              </div>
              <div className="row">
                {canEdit && (
                  <button
                    type="button"
                    className="text-button"
                    aria-label={`${c.text("Edit city", "تعديل المدينة")} ${c.local(city.name)}`}
                    onClick={() => editCity(city)}
                  >
                    {c.text("Edit city", "تعديل المدينة")}
                  </button>
                )}
                {canEdit && (
                  <button
                    type="button"
                    className="text-button"
                    aria-label={`${c.text("Add area in", "إضافة منطقة في")} ${c.local(city.name)}`}
                    onClick={() => editArea(null, city.id)}
                  >
                    {c.text("Add area", "إضافة منطقة")}
                  </button>
                )}
                {canDelete && city.areaCount === 0 && (
                  <button
                    type="button"
                    className="text-button"
                    aria-label={`${c.text("Delete city", "حذف المدينة")} ${c.local(city.name)}`}
                    onClick={() => askDeleteCity(city)}
                  >
                    {c.text("Delete", "حذف")}
                  </button>
                )}
              </div>
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
                        {area.ownFee === null
                          ? c.text(`${city.name.en} fee`, `رسوم ${city.name.ar}`)
                          : c.text("own fee", "رسوم خاصة")}
                        {!area.active && ` · ${c.text("Hidden", "مخفية")}`}
                        {area.isSample && ` · ${c.text("Sample", "مثال")}`}
                      </span>
                    </div>
                    <div className="row">
                      {canEdit && (
                        <button
                          type="button"
                          className="text-button"
                          aria-label={`${c.text("Edit", "تعديل")} ${c.local(area.name)}`}
                          onClick={() => editArea(area)}
                        >
                          {c.text("Edit", "تعديل")}
                        </button>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          className="text-button"
                          aria-label={`${c.text("Delete", "حذف")} ${c.local(area.name)}`}
                          onClick={() => askDeleteArea(area)}
                        >
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
        open={cityDraft !== null}
        onOpenChange={(value) => !value && setCityDraft(null)}
        title={cityDraft?.city ? c.text("Edit city", "تعديل المدينة") : c.text("New city", "مدينة جديدة")}
        description={c.text(
          "The city fee is charged for every area in this city that has no fee of its own.",
          "تُطبق رسوم المدينة على كل منطقة فيها ليس لها رسوم خاصة.",
        )}
      >
        {cityDraft && (
          <form className="form-stack" onSubmit={submitCity}>
            <div className="form-two">
              <Field label={c.text("Name · English", "الاسم · الإنجليزية")}>
                <input required maxLength={80} value={cityDraft.en} onChange={(e) => setCityDraft({ ...cityDraft, en: e.target.value })} />
              </Field>
              <Field label={c.text("Name · Arabic", "الاسم · العربية")}>
                <input required maxLength={80} dir="rtl" value={cityDraft.ar} onChange={(e) => setCityDraft({ ...cityDraft, ar: e.target.value })} />
              </Field>
            </div>
            <Field label={c.text("City fee (QAR, 0 = free)", "رسوم المدينة (ر.ق، 0 = مجاني)")}>
              <NumberInput kind="decimal" required dir="ltr" value={cityDraft.feeQar} onChange={(e) => setCityDraft({ ...cityDraft, feeQar: e.target.value })} />
            </Field>
            {cityDraft.city && (
              <p className="small muted">
                {c.text(
                  `Areas using the city fee: ${following(cityDraft.city.id)} of ${cityDraft.city.areaCount}. The others have their own fee.`,
                  `المناطق التي تستخدم رسوم المدينة: ${following(cityDraft.city.id)} من ${cityDraft.city.areaCount}. والباقي لها رسوم خاصة.`,
                )}
              </p>
            )}
            <Field label={c.text("Order in lists (smaller first)", "الترتيب في القوائم (الأصغر أولاً)")}>
              <NumberInput
                min={0}
                max={1000}
                required
                value={cityDraft.sortOrder}
                onChange={(e) => setCityDraft({ ...cityDraft, sortOrder: Number(e.target.value) })}
              />
            </Field>
            <label className="row">
              <input type="checkbox" checked={cityDraft.active} onChange={(e) => setCityDraft({ ...cityDraft, active: e.target.checked })} />
              {c.text("Deliver to this city", "التوصيل إلى هذه المدينة")}
            </label>
            <ErrorMessage message={error} />
            <div className="row">
              <button type="button" className="button button--secondary" onClick={() => setCityDraft(null)}>
                {c.text("Cancel", "إلغاء")}
              </button>
              <button type="submit" className="button button--primary" disabled={saveCity.isPending}>
                {c.text("Save city", "احفظ المدينة")}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        open={areaDraft !== null}
        onOpenChange={(value) => !value && setAreaDraft(null)}
        title={areaDraft?.area ? c.text("Edit area", "تعديل المنطقة") : c.text("New area", "منطقة جديدة")}
        description={c.text(
          "An area follows its city's fee unless you give it its own.",
          "تتبع المنطقة رسوم مدينتها ما لم تعطها رسوماً خاصة.",
        )}
      >
        {areaDraft && (
          <form className="form-stack" onSubmit={submitArea}>
            <div className="form-two">
              <Field label={c.text("Name · English", "الاسم · الإنجليزية")}>
                <input required maxLength={80} value={areaDraft.en} onChange={(e) => setAreaDraft({ ...areaDraft, en: e.target.value })} />
              </Field>
              <Field label={c.text("Name · Arabic", "الاسم · العربية")}>
                <input required maxLength={80} dir="rtl" value={areaDraft.ar} onChange={(e) => setAreaDraft({ ...areaDraft, ar: e.target.value })} />
              </Field>
            </div>
            <Field label={c.text("City", "المدينة")}>
              <select required value={areaDraft.cityId} onChange={(e) => setAreaDraft({ ...areaDraft, cityId: e.target.value })}>
                {cities.map((city) => (
                  <option key={city.id} value={city.id}>
                    {c.local(city.name)}
                    {!city.active && ` (${c.text("deliveries stopped", "التوصيل متوقف")})`}
                  </option>
                ))}
              </select>
            </Field>
            <label className="row">
              <input
                type="checkbox"
                checked={areaDraft.followsCity}
                onChange={(e) => setAreaDraft({ ...areaDraft, followsCity: e.target.checked })}
              />
              {draftCity
                ? c.text(`Use the ${draftCity.name.en} fee (${feeText(draftCity.fee)})`, `استخدام رسوم ${draftCity.name.ar} (${feeText(draftCity.fee)})`)
                : c.text("Use the city fee", "استخدام رسوم المدينة")}
            </label>
            {!areaDraft.followsCity && (
              <Field label={c.text("Own fee for this area (QAR, 0 = free)", "رسوم خاصة لهذه المنطقة (ر.ق، 0 = مجاني)")}>
                <NumberInput kind="decimal" required dir="ltr" value={areaDraft.feeQar} onChange={(e) => setAreaDraft({ ...areaDraft, feeQar: e.target.value })} />
              </Field>
            )}
            <Field label={c.text("Order in its city (smaller first)", "الترتيب داخل المدينة (الأصغر أولاً)")}>
              <NumberInput
                min={0}
                max={1000}
                required
                value={areaDraft.sortOrder}
                onChange={(e) => setAreaDraft({ ...areaDraft, sortOrder: Number(e.target.value) })}
              />
            </Field>
            <label className="row">
              <input type="checkbox" checked={areaDraft.active} onChange={(e) => setAreaDraft({ ...areaDraft, active: e.target.checked })} />
              {c.text("Offer this area at checkout", "عرض هذه المنطقة عند الدفع")}
            </label>
            <ErrorMessage message={error} />
            <div className="row">
              <button type="button" className="button button--secondary" onClick={() => setAreaDraft(null)}>
                {c.text("Cancel", "إلغاء")}
              </button>
              <button type="submit" className="button button--primary" disabled={saveArea.isPending}>
                {c.text("Save area", "احفظ المنطقة")}
              </button>
            </div>
          </form>
        )}
      </Modal>
      <ConfirmDialog request={confirming} onClose={() => setConfirming(null)} />
    </section>
  );
}
