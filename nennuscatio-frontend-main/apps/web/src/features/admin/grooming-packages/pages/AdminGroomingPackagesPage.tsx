"use client";
import { useState } from "react";
import { Scissors, Clock3, CheckCircle2, CalendarDays } from "lucide-react";
import { useBusiness } from "@/mocks/MockDataProvider";
import { petCategories, type Package } from "@/mocks/data/business";
import { useCopy } from "@/shared/lib/copy";
import { Photo } from "@/shared/ui/Photo";
import { AdminMetric } from "@/shared/ui/AdminMetric";
import { Link } from "@/i18n/navigation";
import { AdminPage, Modal, StatusBadge } from "@/shared/ui/BusinessUI";
import { useRepositories } from "@/shared/api/DataSourceProvider";
import { PackageEditor } from "../components/PackageEditor";
import { AdminGroomingPackagesApiPage } from "./AdminGroomingPackagesApiPage";

/** The real groups and packages (9a) in API mode; the original demo in the development mock mode. */
export function AdminGroomingPackagesPage() {
  const { source } = useRepositories();
  return source === "api" ? <AdminGroomingPackagesApiPage /> : <AdminGroomingPackagesDemoPage />;
}

function AdminGroomingPackagesDemoPage() {
  const c = useCopy(),
    d = useBusiness();
  const [pet, setPet] = useState(""),
    [selectedId, setSelectedId] = useState(""),
    [edit, setEdit] = useState<Package | null>(null);
  const selected = d.packages.find((p) => p.id === selectedId);
  return (
    <AdminPage
      module="groomingPackages"
      title={c.text("Grooming Packages", "باقات العناية")}
      subtitle={c.text(
        "Eight independent configurations. Changes affect future bookings, not historical booking snapshots.",
        "ثمانية إعدادات مستقلة. التغييرات للحجوزات المستقبلية فقط.",
      )}
    >
      <div className="admin-metrics">
        <AdminMetric
          icon={Scissors}
          label={c.text("Grooming packages", "باقات العناية")}
          value={d.packages.length}
        />
        <AdminMetric
          icon={CheckCircle2}
          label={c.text("Active packages", "الباقات النشطة")}
          value={d.packages.filter((p) => p.active).length}
        />
        <AdminMetric
          icon={CalendarDays}
          label={c.text("Pet categories", "فئات الحيوانات")}
          value={petCategories.length}
        />
        <AdminMetric
          icon={Clock3}
          label={c.text("Upcoming bookings", "الحجوزات القادمة")}
          value={
            d.bookings.filter((b) =>
              ["pending", "confirmed"].includes(b.status),
            ).length
          }
        />
      </div>
      <div className="admin-tabs">
        <Link href="/admin/products">
          {c.text("Products & Pet Houses", "المنتجات وبيوت الحيوانات")}
        </Link>
        <span aria-current="page">
          {c.text("Grooming Services", "خدمات العناية")}
        </span>
      </div>
      <fieldset
        className="admin-tabs"
        aria-label={c.text("Filter by pet category", "تصفية حسب فئة الحيوان")}
      >
        <button type="button" aria-pressed={!pet} onClick={() => setPet("")}>
          {c.text("All", "الكل")}
        </button>
        {petCategories.map((x) => (
          <button
            type="button"
            key={x.id}
            aria-pressed={pet === x.id}
            onClick={() => setPet(x.id)}
          >
            {c.local(x.name)}
          </button>
        ))}
      </fieldset>
      <div className="panel admin-record-panel">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{c.text("Package", "الباقة")}</th>
                <th>{c.text("Pet category", "فئة الحيوان")}</th>
                <th>{c.text("Tier", "المستوى")}</th>
                <th>{c.text("Duration", "المدة")}</th>
                <th>{c.text("Price", "السعر")}</th>
                <th>{c.text("Status", "الحالة")}</th>
                <th>{c.text("Actions", "الإجراءات")}</th>
              </tr>
            </thead>
            <tbody>
              {d.packages
                .filter((p) => !pet || pet === p.petCategory)
                .map((p) => (
                  <tr
                    key={p.id}
                    className={selectedId === p.id ? "is-selected" : ""}
                  >
                    <td>
                      <div className="compact-record">
                        <Photo src={p.image} alt="" />
                        <strong>{c.local(p.name)}</strong>
                      </div>
                    </td>
                    <td>
                      {c.local(
                        petCategories.find((x) => x.id === p.petCategory)
                          ?.name ?? p.name,
                      )}
                    </td>
                    <td>
                      {c.text(
                        p.tier === "basic" ? "Basic" : "Full",
                        p.tier === "basic" ? "أساسي" : "كامل",
                      )}
                    </td>
                    <td>
                      {p.duration} {c.text("min", "د")}
                    </td>
                    <td>{c.money(p.price)}</td>
                    <td>
                      <StatusBadge value={p.active ? "active" : "inactive"} />
                    </td>
                    <td>
                      <div className="row">
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => setSelectedId(p.id)}
                        >
                          {c.text("View", "عرض")}
                        </button>
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => {
                            setEdit(structuredClone(p));
                          }}
                        >
                          {c.text("Edit", "تعديل")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
      <Modal
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelectedId("");
        }}
        title={selected ? c.local(selected.name) : ""}
        placement="side"
        description={c.text(
          "Mock package detail. Future bookings use updated packages; previous booking snapshots do not change.",
          "تفاصيل باقة تجريبية. الحجوزات المستقبلية تستخدم التعديل، ولا تتغير الحجوزات السابقة.",
        )}
      >
        {selected && (
          <div className="form-stack">
            <Photo
              src={selected.image}
              alt={c.local(selected.name)}
              className="admin-detail-photo"
            />
            <StatusBadge value={selected.active ? "active" : "inactive"} />
            <p>{c.local(selected.description)}</p>
            <div className="admin-detail-section">
              <h3>{c.text("Configuration", "الإعداد")}</h3>
              <div className="admin-detail-row">
                <span>{c.text("Category", "الفئة")}</span>
                <strong>
                  {c.local(
                    petCategories.find((x) => x.id === selected.petCategory)
                      ?.name ?? selected.name,
                  )}
                </strong>
              </div>
              <div className="admin-detail-row">
                <span>{c.text("Duration", "المدة")}</span>
                <strong>
                  {selected.duration} {c.text("minutes", "دقيقة")}
                </strong>
              </div>
              <div className="admin-detail-row">
                <span>{c.text("Price", "السعر")}</span>
                <strong>{c.money(selected.price)}</strong>
              </div>
            </div>
            <div className="admin-detail-section">
              <h3>{c.text("Included care", "العناية المشمولة")}</h3>
              <ul>
                {selected.inclusions.map((item) => (
                  <li key={`${item.en}-${item.ar}`}>{c.local(item)}</li>
                ))}
              </ul>
            </div>
            <button
              type="button"
              className="button button--primary"
              onClick={() => {
                setEdit(structuredClone(selected));
                setSelectedId("");
              }}
            >
              {c.text("Edit package", "تعديل الباقة")}
            </button>
          </div>
        )}
      </Modal>
      {edit && (
        <PackageEditor
          key={edit.id}
          initial={edit}
          onClose={() => setEdit(null)}
        />
      )}
    </AdminPage>
  );
}
