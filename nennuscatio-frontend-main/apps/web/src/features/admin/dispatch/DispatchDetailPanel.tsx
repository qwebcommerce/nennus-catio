"use client";
import {
  CalendarDays,
  ChevronRight,
  CheckCircle2,
  ExternalLink,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  Truck,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { Link } from "@/i18n/navigation";
import type { DispatchJob } from "@/mocks/adapters/dispatch-repository";
import {
  dispatchKinds,
  dispatchStatuses,
  dispatchTeam,
  type DispatchStatus,
} from "@/mocks/data/dispatch";
import { useCopy } from "@/shared/lib/copy";
import { Photo } from "@/shared/ui/Photo";

export function DispatchBadge({ status }: { status: DispatchStatus }) {
  const c = useCopy();
  return (
    <span className={`dispatch-badge dispatch-badge--${status}`}>
      {c.local(dispatchStatuses.find((s) => s.id === status)!.label)}
    </span>
  );
}
export function DispatchDetailPanel({
  job,
  onClose,
  onAssign,
  onAdvance,
}: {
  job: DispatchJob;
  onClose: () => void;
  onAssign: () => void;
  onAdvance: (status: DispatchStatus) => void;
}) {
  const c = useCopy(),
    closeRef = useRef<HTMLButtonElement>(null),
    member = dispatchTeam.find((m) => m.id === job.assignedTo);
  useEffect(() => {
    if (job.id) closeRef.current?.focus();
  }, [job.id]);
  const date = job.date
    ? new Intl.DateTimeFormat(c.ar ? "ar-QA" : "en-GB", {
        dateStyle: "medium",
        timeZone: "Asia/Qatar",
      }).format(new Date(`${job.date}T12:00:00Z`))
    : c.text("Needs a slot", "يحتاج موعداً");
  return (
    <aside
      className="dispatch-detail"
      aria-label={c.text("Dispatch details", "تفاصيل التوصيل")}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div className="dispatch-detail-heading">
        <h2>
          <bdi>{job.id}</bdi>
        </h2>
        <button
          type="button"
          ref={closeRef}
          className="icon-button"
          aria-label={c.text("Close dispatch details", "إغلاق تفاصيل التوصيل")}
          onClick={onClose}
        >
          <X size={18} />
        </button>
        <small>
          {date}
          {job.time && (
            <>
              {" "}
              · <bdi>{job.time}</bdi>
            </>
          )}
        </small>
        <DispatchBadge status={job.status} />
      </div>
      <section>
        <h3>{c.text("Source", "المصدر")}</h3>
        <Link
          className="dispatch-source"
          href={`/admin/${job.source === "order" ? "orders" : "bookings"}?search=${encodeURIComponent(job.sourceId)}`}
        >
          <Photo
            src={job.image}
            alt=""
            sizes="48px"
            unavailableLabel={c.text("No photo", "لا صورة")}
          />
          <span>
            <strong>
              <bdi>{job.sourceId}</bdi>
            </strong>
            <small>
              {c.local(dispatchKinds.find((k) => k.id === job.kind)!.label)}
            </small>
          </span>
          <ChevronRight size={17} />
        </Link>
      </section>
      <section>
        <div className="row spread">
          <h3>{c.text("Customer", "العميل")}</h3>
          {job.email && (
            <Link
              className="text-link"
              href={`/admin/customers?search=${encodeURIComponent(job.email)}`}
            >
              {c.text("View customer", "عرض العميل")}
              <ChevronRight size={12} />
            </Link>
          )}
        </div>
        <div className="dispatch-contact">
          <Photo
            src={job.image}
            alt=""
            sizes="52px"
            unavailableLabel={c.text("No photo", "لا صورة")}
          />
          <div>
            <strong>
              {job.customerName ||
                c.text("Customer unavailable", "العميل غير متاح")}
            </strong>
            {job.petName && <small>{job.petName}</small>}
            <small>
              <Phone size={13} />
              <bdi>{job.phone || "—"}</bdi>
            </small>
            <small>
              <Mail size={13} />
              <bdi>{job.email || "—"}</bdi>
            </small>
          </div>
        </div>
      </section>
      <section>
        <h3>{c.text("Destination", "الوجهة")}</h3>
        <div className="dispatch-destination">
          <MapPin size={18} />
          <p>{job.address || c.text("No address recorded", "لا عنوان مسجل")}</p>
          {job.address && (
            <a
              className="button button--secondary"
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.address)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {c.text("Open Map", "الخريطة")}
              <ExternalLink size={12} />
            </a>
          )}
        </div>
      </section>
      <section>
        <h3>{c.text("Schedule", "الموعد")}</h3>
        <div className="dispatch-schedule-info">
          <CalendarDays size={20} />
          <span>
            {date}
            <small>
              <bdi>{job.time || "—"}</bdi> · {c.text("Qatar time", "توقيت قطر")}
              {job.duration > 0 &&
                ` · ${job.duration} ${c.text("min", "دقيقة")}`}
            </small>
          </span>
        </div>
      </section>
      <section>
        <h3>
          {c.text("Items", "العناصر")} ({job.items.length})
        </h3>
        <div className="dispatch-items">
          {job.items.map((item) => (
            <div key={item.id}>
              <Photo
                src={item.image}
                alt=""
                sizes="40px"
                unavailableLabel={c.text("No photo", "لا صورة")}
              />
              <span>
                {c.local(item.name)}
                {item.sku && (
                  <small>
                    <bdi>SKU: {item.sku}</bdi>
                  </small>
                )}
              </span>
              <bdi>× {item.quantity}</bdi>
            </div>
          ))}
        </div>
      </section>
      <section>
        <div className="row spread">
          <h3>{c.text("Assignment", "التعيين")}</h3>
          {job.status !== "completed" && (
            <button type="button" className="text-link" onClick={onAssign}>
              {member
                ? c.text("Reassign", "إعادة التعيين")
                : c.text("Assign", "تعيين")}
            </button>
          )}
        </div>
        <div className="dispatch-assignment">
          {job.kind === "grooming" ? (
            <UserRound size={23} />
          ) : (
            <Truck size={23} />
          )}
          <span>
            <strong>
              {member
                ? c.local(member.name)
                : c.text("Not assigned", "غير معين")}
            </strong>
            <small>
              {c.text(
                "Local mock assignment. No fleet reference.",
                "تعيين تجريبي محلي. لا مرجع للأسطول.",
              )}
            </small>
          </span>
        </div>
        {job.note && <p className="dispatch-note">{job.note}</p>}
      </section>
      <section>
        <h3>{c.text("Dispatch Status", "حالة التوصيل")}</h3>
        {job.sourceCompleted ? (
          <p className="dispatch-note">
            {c.text(
              "Completed in the source record. No driver history was supplied.",
              "مكتمل في السجل الأصلي. لا يوجد سجل للسائق.",
            )}
          </p>
        ) : (
          <>
            <ol className="dispatch-timeline">
              {dispatchStatuses.map((step, index) => {
                const position = dispatchStatuses.findIndex(
                  (s) => s.id === job.status,
                );
                return (
                  <li
                    key={step.id}
                    className={index <= position ? "is-reached" : ""}
                  >
                    <CheckCircle2 size={16} />
                    <span>{c.local(step.label)}</span>
                    {index === position && (
                      <small>{c.text("Current", "الحالية")}</small>
                    )}
                  </li>
                );
              })}
            </ol>
            {job.events.length > 0 && (
              <details className="dispatch-activity">
                <summary>
                  {c.text("Local activity", "النشاط المحلي")} (
                  {job.events.length})
                </summary>
                {job.events.map((event) => (
                  <p key={event.id}>
                    {c.local(
                      dispatchStatuses.find((s) => s.id === event.status)!
                        .label,
                    )}{" "}
                    ·{" "}
                    {c.local(
                      dispatchTeam.find((m) => m.id === event.assignedTo)!.name,
                    )}
                    <small>
                      {new Intl.DateTimeFormat(c.ar ? "ar-QA" : "en-GB", {
                        dateStyle: "short",
                        timeStyle: "short",
                        timeZone: "Asia/Qatar",
                      }).format(new Date(event.at))}
                    </small>
                  </p>
                ))}
              </details>
            )}
            {job.status === "assigned" && (
              <button
                type="button"
                className="button"
                onClick={() => onAdvance("en-route")}
              >
                {c.text("Mark En Route · mock", "تعيين في الطريق · تجريبي")}
              </button>
            )}
            {job.status === "en-route" && (
              <button
                type="button"
                className="button"
                onClick={() => onAdvance("completed")}
              >
                {c.text("Mark Completed · mock", "تعيين مكتمل · تجريبي")}
              </button>
            )}
          </>
        )}
      </section>
      <section className="dispatch-fleet">
        <h3>{c.text("Fleet Sync", "مزامنة الأسطول")}</h3>
        <span>
          <RefreshCw size={14} />
          {c.text("Not connected", "غير متصل")}
        </span>
      </section>
      <p className="dispatch-note">
        {c.text(
          "Assignments and progress are simulated. Source orders/bookings are unchanged. Refresh resets changes.",
          "التعيين والتقدم تجريبيان. لا تغيير في الطلبات والحجوزات الأصلية. التحديث يعيد التغييرات.",
        )}
      </p>
    </aside>
  );
}
