"use client";
import { useState } from "react";
import {
  CalendarDays,
  ExternalLink,
  Plus,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useBusiness, repo } from "@/mocks/MockDataProvider";
import {
  cataloguePetTypes,
  petCategories,
  type Package,
  type Product,
} from "@/mocks/data/business";
import { describeSaveError, useAdminCatalog, useAdminCategories, useCategoryOptions } from "@/shared/api/admin-catalog";
import { houseReadiness, readinessLabel } from "@/features/pet-houses/lib/readiness";
import { useAdminAccess } from "@/shared/access/AdminAccess";
import { useCopy } from "@/shared/lib/copy";
import { ConfirmDialog, type ConfirmRequest } from "@/shared/ui/ConfirmDialog";
import { Photo } from "@/shared/ui/Photo";
import { ErrorMessage } from "@/shared/ui/BusinessUI";
import { cataloguePerformance, stockState } from "../lib/catalogue";
import { StockAdjustDialog } from "./StockAdjustDialog";
export function StockBadge({ state }: { state: "in" | "low" | "out" }) {
  const c = useCopy();
  return (
    <span className={`admin-catalogue-badge admin-catalogue-badge--${state}`}>
      <i />
      {state === "in"
        ? c.text("In Stock", "متوفر")
        : state === "low"
          ? c.text("Low Stock", "مخزون منخفض")
          : c.text("Out of Stock", "نفد المخزون")}
    </span>
  );
}
export function CatalogueStatus({ active }: { active: boolean }) {
  const c = useCopy();
  return (
    <span
      className={`admin-catalogue-badge admin-catalogue-badge--${active ? "in" : "inactive"}`}
    >
      <i />
      {active ? c.text("Active", "نشط") : c.text("Inactive", "غير نشط")}
    </span>
  );
}
export function CatalogueDetail({
  record,
  date,
  onClose,
  onEdit,
}: {
  record: Product | Package;
  date: string;
  onClose: () => void;
  onEdit: () => void;
}) {
  const c = useCopy(),
    data = useBusiness(),
    catalog = useAdminCatalog(),
    categories = useCategoryOptions(),
    access = useAdminAccess(),
    [error, setError] = useState(""),
    [days, setDays] = useState(30),
    [image, setImage] = useState(""),
    [adjusting, setAdjusting] = useState<Product["variants"][number] | null>(null),
    [confirming, setConfirming] = useState<ConfirmRequest | null>(null);
  const canEdit = access.can("products", "edit");
  const adminCategories = useAdminCategories(),
    housesShown = catalog.source !== "api" || (adminCategories.data?.find((x) => x.isHouseCategory)?.active ?? true);
  const product = "variants" in record ? record : null,
    service = "petCategory" in record ? record : null;
  const photos = Array.from(
    new Set(
      product
        ? [record.image, ...(product.gallery ?? []).map((x) => x.src)]
        : [record.image],
    ),
  );
  const performance = cataloguePerformance(data, record, date, days);
  async function update(changes: Partial<Product>) {
    if (!product) return;
    try {
      await catalog.saveProduct({ ...product, ...changes }, product.serverId ? product : null);
      setError("");
    } catch (err) {
      setError(describeSaveError(err, c.text));
    }
  }
  async function setVisible(active: boolean) {
    if (product) await update({ active });
    else if (service) {
      try {
        repo.savePackage({ ...service, active });
        setError("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Please retry");
      }
    }
  }
  // Hiding takes the item off the website, so it asks first (D128); showing it again does not,
  // like switching a delivery city back on.
  function toggleVisible(active: boolean) {
    if (record.active && !active) {
      setConfirming({
        title: c.text(`Hide “${record.name.en}” from the store?`, `إخفاء «${record.name.ar}» من المتجر؟`),
        message: product
          ? c.text(
              "Customers will no longer see it on the website or be able to order it. Orders already placed stay. You can show it again at any time.",
              "لن يراه العملاء في الموقع ولن يتمكنوا من طلبه. تبقى الطلبات المرسلة. يمكنك إظهاره مرة أخرى في أي وقت.",
            )
          : c.text(
              "Customers will no longer see this package on the website or be able to book it. You can show it again at any time.",
              "لن يرى العملاء هذه الباقة في الموقع ولن يتمكنوا من حجزها. يمكنك إظهارها مرة أخرى في أي وقت.",
            ),
        confirmLabel: c.text("Hide from store", "إخفاء من المتجر"),
        run: () => setVisible(false),
      });
      return;
    }
    void setVisible(active);
  }
  const category = product
      ? categories.find((x) => x.id === product.category)
      : null,
    pet = product
      ? cataloguePetTypes.find((x) => x.id === product.pet)
      : petCategories.find((x) => x.id === service?.petCategory);
  const info = [
    [
      c.text(
        product ? "Product ID" : "Package ID",
        product ? "رمز المنتج" : "رمز الباقة",
      ),
      record.id,
    ],
    [c.text("Name", "الاسم"), c.local(record.name)],
    [
      c.text(
        product ? "Brand" : "Package",
        product ? "العلامة التجارية" : "الباقة",
      ),
      product
        ? product.brand || c.text("Not specified", "غير محدد")
        : c.text(
            service?.tier === "basic" ? "Basic" : "Full",
            service?.tier === "basic" ? "أساسية" : "كاملة",
          ),
    ],
    [
      c.text("Category", "الفئة"),
      category ? c.local(category.name) : c.text("Grooming", "العناية"),
    ],
    [
      c.text("Pet Type", "نوع الحيوان"),
      pet ? c.local(pet.name) : c.text("Not specified", "غير محدد"),
    ],
    [c.text("Description", "الوصف"), c.local(record.description)],
  ];
  return (
    <aside
      className="admin-catalogue-detail"
      aria-label={c.text("Catalogue details", "تفاصيل الكتالوج")}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <header>
        <h2>{c.local(record.name)}</h2>
        <CatalogueStatus active={record.active} />
        <button
          type="button"
          className="icon-button"
          aria-label={c.text(
            "Close catalogue details",
            "إغلاق تفاصيل الكتالوج",
          )}
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </header>
      <section className="admin-catalogue-info">
        <Photo
          src={photos.includes(image) ? image : record.image}
          alt={c.local(record.name)}
          className="admin-catalogue-detail-photo"
        />
        <div>
          <h3>
            {c.text(
              product ? "Product Information" : "Service Information",
              product ? "معلومات المنتج" : "معلومات الخدمة",
            )}
          </h3>
          <dl>
            {info.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
      <section>
        <div className="admin-catalogue-section-title">
          <h3>
            {c.text(
              product ? "Variants & Inventory" : "Package Configuration",
              product ? "الخيارات والمخزون" : "إعداد الباقة",
            )}
          </h3>
          <button type="button" className="text-button" onClick={onEdit}>
            {c.text(
              product ? "Add Variant" : "Edit Package",
              product ? "إضافة خيار" : "تعديل الباقة",
            )}
          </button>
        </div>
        {product ? (
          <div className="admin-catalogue-table-scroll">
            <table className="admin-catalogue-variants">
              <thead>
                <tr>
                  {[
                    c.text("Variant", "الخيار"),
                    "SKU",
                    c.text("Price", "السعر"),
                    c.text("Stock", "المخزون"),
                    c.text("Low Stock", "حد التنبيه"),
                    c.text("Stock Status", "حالة المخزون"),
                    ...(catalog.source === "api" && canEdit ? [c.text("Stock change", "تعديل المخزون")] : []),
                  ].map((label) => (
                    <th key={label}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {product.variants.map((v) => (
                  <tr key={v.id}>
                    <td>
                      <strong>{c.local(v.label)}</strong>
                    </td>
                    <td>
                      <bdi>{v.sku}</bdi>
                      {v.pos && (
                        <small className="pos-tag" title={c.text(`Follows POS item ${v.pos.code}`, `تتبع صنف نقطة البيع ${v.pos.code}`)}>
                          {" "}
                          {c.text("POS", "نقطة البيع")}
                        </small>
                      )}
                    </td>
                    <td>
                      {product.house?.purchaseMode === "inquiry"
                        ? c.text("On inquiry", "عند الاستفسار")
                        : c.money(v.price)}
                    </td>
                    <td>{v.stock}</td>
                    <td>{v.lowStock ?? 5}</td>
                    <td>
                      <StockBadge state={stockState([v])} />
                    </td>
                    {catalog.source === "api" && canEdit && (
                      <td>
                        {/* A pack the POS manages takes its stock from the POS; the owner's "Edit anyway" is in the editor (#16 part 2c). */}
                        {v.pos ? (
                          <span className="small muted" title={c.text("Stock comes from the POS. The owner can use “Edit anyway” in the editor.", "يأتي المخزون من نظام نقطة البيع. ويمكن للمالك استخدام «تعديل رغم ذلك» في المحرر.")}>
                            {c.text("From the POS", "من نقطة البيع")}
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="text-button"
                            disabled={!v.serverId}
                            onClick={() => setAdjusting(v)}
                          >
                            {c.text("Adjust", "تعديل")}
                            <span className="sr-only"> {c.local(v.label)}</span>
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <>
            <dl className="admin-catalogue-property-list">
              <div>
                <dt>{c.text("Price", "السعر")}</dt>
                <dd>{c.money(service?.price ?? 0)}</dd>
              </div>
              <div>
                <dt>{c.text("Duration", "المدة")}</dt>
                <dd>
                  {service?.duration} {c.text("minutes", "دقيقة")}
                </dd>
              </div>
            </dl>
            <ul>
              {service?.inclusions.map((item) => (
                <li key={item.en}>{c.local(item)}</li>
              ))}
            </ul>
          </>
        )}
        {product?.house && (
          <dl className="admin-catalogue-property-list">
            {/* The same rule as checkout and the editor's checklist (#14, D268). */}
            <div>
              <dt>{c.text("Online orders", "الطلب عبر الموقع")}</dt>
              <dd>{readinessLabel(houseReadiness(product, housesShown), c.text)}</dd>
            </div>
            <div>
              <dt>{c.text("Availability", "التوفر")}</dt>
              <dd>
                {product.house.availability === "made-to-order"
                  ? c.text("Made to order", "يُصنع عند الطلب")
                  : product.house.availability === "in-stock"
                    ? c.text("In stock", "متوفر في المخزون")
                    : c.text("Not confirmed yet", "غير مؤكد بعد")}
              </dd>
            </div>
            <div>
              <dt>{c.text("Ready in about", "جاهز خلال")}</dt>
              <dd>
                {product.house.leadTime
                  ? `${product.house.leadTime.minDays}–${product.house.leadTime.maxDays} ${c.text("days", "أيام")}`
                  : c.text("Not set yet", "لم تُحدد بعد")}
              </dd>
            </div>
            <div>
              <dt>{c.text("Delivery charge", "رسوم التوصيل")}</dt>
              <dd>
                {product.house.deliveryFee === null
                  ? c.text("Not set yet", "لم تُحدد بعد")
                  : product.house.deliveryFee === 0
                    ? c.text("No extra charge", "بلا رسوم إضافية")
                    : c.text(`${c.money(product.house.deliveryFee)} per house`, `${c.money(product.house.deliveryFee)} لكل بيت`)}
              </dd>
            </div>
          </dl>
        )}
      </section>
      <section>
        <div className="admin-catalogue-section-title">
          <h3>{c.text("Storefront", "واجهة المتجر")}</h3>
          <button type="button" className="text-button" onClick={onEdit}>
            {c.text("Edit", "تعديل")}
          </button>
        </div>
        <label className="admin-catalogue-toggle">
          <span>{c.text("Visible on Store", "ظاهر في المتجر")}</span>
          <input
            type="checkbox"
            role="switch"
            aria-checked={record.active}
            checked={record.active}
            disabled={catalog.source === "api" && !canEdit}
            onChange={(e) => toggleVisible(e.target.checked)}
          />
          <small>{c.text("Visible (active)", "ظاهر (نشط)")}</small>
        </label>
        {product && (
          <>
            <label className="admin-catalogue-toggle">
              <span>{c.text("Featured", "مميز")}</span>
              <input
                type="checkbox"
                checked={product.featured ?? false}
                disabled={catalog.source === "api" && !canEdit}
                onChange={(e) => void update({ featured: e.target.checked })}
              />
              <small>
                {c.text(
                  "Feature on homepage / collections",
                  "عرض في الصفحة الرئيسية والمجموعات",
                )}
              </small>
            </label>
            <label className="admin-catalogue-toggle">
              <span>{c.text("Best Seller", "الأكثر مبيعاً")}</span>
              <input
                type="checkbox"
                checked={product.bestSeller ?? false}
                disabled={catalog.source === "api" && !canEdit}
                onChange={(e) => void update({ bestSeller: e.target.checked })}
              />
              <small>
                {c.text("Show best seller badge", "إظهار شارة الأكثر مبيعاً")}
              </small>
            </label>
            <p className="admin-catalogue-help">
              {catalog.source === "api"
                ? c.text(
                    "Saved with the product. The homepage still shows a fixed selection until featured placement is connected.",
                    "تُحفظ مع المنتج. تعرض الصفحة الرئيسية حالياً اختياراً ثابتاً إلى أن يُربط عرض المميز.",
                  )
                : c.text(
                    "Featured/best-seller flags are saved mock metadata; public placement is not connected yet.",
                    "الحالات المميزة محفوظة تجريبياً؛ الربط بعرض الصفحة العامة لم ينفذ بعد.",
                  )}
            </p>
          </>
        )}
        <div className="admin-catalogue-gallery">
          <span>
            {c.text(
              product ? "Product Images" : "Service Image",
              product ? "صور المنتج" : "صورة الخدمة",
            )}
          </span>
          <div>
            {photos.map((src, i) => (
              <button
                key={src}
                type="button"
                aria-label={c.text(
                  `View image ${i + 1}`,
                  `عرض الصورة ${i + 1}`,
                )}
                aria-pressed={
                  (photos.includes(image) ? image : record.image) === src
                }
                onClick={() => setImage(src)}
              >
                <Photo src={src} alt="" />
              </button>
            ))}
            <button
              type="button"
              aria-label={c.text("Edit catalogue images", "تعديل صور الكتالوج")}
              onClick={onEdit}
            >
              <Plus size={20} />
            </button>
          </div>
        </div>
        <ErrorMessage message={error} />
      </section>
      {adjusting && product && (
        <StockAdjustDialog
          productName={c.local(product.name)}
          variant={adjusting}
          onClose={() => setAdjusting(null)}
          onAdjust={(change, reason) => catalog.adjustStock(adjusting.serverId ?? "", change, reason)}
        />
      )}
      <section>
        <div className="admin-catalogue-section-title">
          <h3>{c.text("Performance", "الأداء")}</h3>
          <select
            aria-label={c.text(
              "Catalogue performance period",
              "فترة أداء الكتالوج",
            )}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            {[30, 90].map((n) => (
              <option key={n} value={n}>
                {c.text(`Last ${n} days`, `آخر ${n} يوماً`)}
              </option>
            ))}
          </select>
        </div>
        <div className="admin-catalogue-performance">
          {[
            {
              icon: TrendingUp,
              value: performance.units,
              label: c.text(
                product ? "Units Sold" : "Paid Bookings",
                product ? "الوحدات المبيعة" : "الحجوزات المدفوعة",
              ),
            },
            {
              icon: Wallet,
              value: c.money(performance.revenue),
              label: c.text("Revenue", "الإيرادات"),
            },
            {
              icon: CalendarDays,
              value: performance.last
                ? new Intl.DateTimeFormat(c.ar ? "ar-QA" : "en-GB", {
                    timeZone: "Asia/Qatar",
                    day: "numeric",
                    month: "short",
                  }).format(new Date(performance.last))
                : c.text("No sales", "لا مبيعات"),
              label: c.text("Last Sold", "آخر بيع"),
            },
          ].map((item) => (
            <div key={item.label}>
              <item.icon size={17} />
              <strong>{item.value}</strong>
              <small>{item.label}</small>
            </div>
          ))}
        </div>
        <p className="admin-catalogue-help">
          {c.text(
            "Paid, non-cancelled mock records only. Product revenue excludes delivery charges.",
            "السجلات التجريبية المدفوعة وغير الملغاة فقط. الإيرادات دون رسوم التوصيل.",
          )}
        </p>
      </section>
      <footer>
        <Link
          className="admin-catalogue-preview"
          href={
            product
              ? product.house
                ? `/pet-houses/${product.id}`
                : `/shop/${product.id}`
              : `/grooming/book?package=${service?.id}`
          }
        >
          {c.text("Preview on Website", "معاينة الموقع")}
          <ExternalLink size={13} />
        </Link>
        <button type="button" onClick={onEdit}>
          {c.text(
            product ? "Edit Product" : "Edit Package",
            product ? "تعديل المنتج" : "تعديل الباقة",
          )}
        </button>
      </footer>
      <ConfirmDialog request={confirming} onClose={() => setConfirming(null)} />
    </aside>
  );
}
