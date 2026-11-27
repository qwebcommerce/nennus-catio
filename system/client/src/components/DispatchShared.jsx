import React from "react";
import { useI18n } from "../context/LanguageContext.jsx";
import { ProductImagePreview } from "./ProductImagePreview.jsx";
import { formatDate, formatDateTime } from "../utils/qatarDate.js";

/** fix-rb: pieces shared by the driver dashboard, the assignment screen and the approval queue. */

export function money(v, t) {
  return `${Number(v || 0).toFixed(2)} ${t("common.currency")}`;
}

export function qtyText(qty, sellBy, t) {
  if (sellBy === "WEIGHT") return `${(Number(qty) / 1000).toFixed(3).replace(/\.?0+$/, "") || 0} ${t("stockUnit.kg")}`;
  return t("stockUnit.pieces", { pieces: qty });
}

export function lineName(l, locale) {
  return locale === "en" ? l.nameEn || l.name : l.name || l.nameEn;
}

export function areaName(area, locale) {
  if (!area) return "";
  return locale === "en" ? area.nameEn || area.name : area.name || area.nameEn;
}

export function personLabel(p, locale) {
  if (!p) return "";
  return locale === "en" ? p.nameEn || p.name : p.name || p.nameEn;
}

const STATUS_TONE = { UNASSIGNED: "warn", DECLINED: "bad", ASSIGNED: "warn", ACCEPTED: "ok", DELIVERED: "ok", CANCELLED: "bad" };

export function KindBadge({ kind }) {
  const { t } = useI18n();
  return <span className="vr-badge" data-testid="kind">{t(`dsp.kind.${kind}`)}</span>;
}

export function StatusBadge({ status }) {
  const { t } = useI18n();
  return <span className={`vr-badge vr-badge--${STATUS_TONE[status] || "warn"}`} data-testid="job-status">{t(`dsp.status.${status}`)}</span>;
}

/** Customer, address, area, date / time, money to collect. */
export function JobFacts({ item, showDriver = false }) {
  const { t, locale } = useI18n();
  return (
    <dl className="vr-meta">
      {item.customer ? (
        <div><dt>{t("dsp.customer")}</dt><dd>{item.customer.name}{item.customer.phone ? <> · <a href={`tel:${item.customer.phone}`}>{item.customer.phone}</a></> : null}</dd></div>
      ) : null}
      <div><dt>{t("dsp.address")}</dt><dd data-testid="job-address">{item.address || "—"}</dd></div>
      <div><dt>{t("dsp.area")}</dt><dd>{item.area ? `${areaName(item.area, locale)}${item.zone ? ` · ${item.zone}` : ""}` : t("dsp.noZone")}</dd></div>
      <div><dt>{t("dsp.when")}</dt><dd>{item.deliveryDate ? formatDate(`${item.deliveryDate}T12:00:00Z`, locale) : "—"}{item.timeNote ? ` · ${item.timeNote}` : ""}</dd></div>
      {Number(item.toCollect) > 0 ? <div><dt>{t("dsp.toCollect")}</dt><dd data-testid="to-collect"><b>{money(item.toCollect, t)}</b></dd></div> : <div><dt>{t("dsp.total")}</dt><dd>{money(item.total, t)}{item.paidOnline ? ` · ${t("dsp.paid")}` : ""}</dd></div>}
      {item.note ? <div><dt>{t("dsp.note")}</dt><dd>{item.note}</dd></div> : null}
      {showDriver && item.vehicle ? <div><dt>{t("dsp.van")}</dt><dd>{item.vehicle.plate}{item.driver ? ` · ${personLabel(item.driver, locale)}` : ""}</dd></div> : null}
      {item.declineReason && item.status === "DECLINED" ? <div><dt>{t("dsp.declineReason")}</dt><dd>{item.declineReason}</dd></div> : null}
      {item.assignedAt && showDriver ? <div><dt>{t("dsp.assignedAt")}</dt><dd>{formatDateTime(item.assignedAt, locale)}</dd></div> : null}
    </dl>
  );
}

export function JobLines({ lines }) {
  const { t, locale } = useI18n();
  if (!lines?.length) return null;
  return (
    <ul className="vr-line-list rb-lines">
      {lines.map((l) => (
        <li key={l.id} className="rb-line">
          <ProductImagePreview url={l.imageUrl} alt="" width={44} height={44} />
          <span className="rb-line__name">{lineName(l, locale)}</span>
          <b className="rb-line__qty">{qtyText(l.quantity, l.sellBy, t)}</b>
        </li>
      ))}
    </ul>
  );
}

/** What a change request asks (lines, address, note, time, date). */
export function ChangeSummary({ request }) {
  const { t, locale } = useI18n();
  const c = request.changes || {};
  const b = request.before || {};
  const byId = new Map((b.lines || []).map((l) => [l.lineId, l]));
  return (
    <ul className="vr-simple" data-testid="change-summary">
      {(c.lines || []).map((l) => {
        const was = byId.get(l.lineId);
        return (
          <li key={l.lineId}>
            <span>{was ? lineName(was, locale) : l.lineId}</span>
            <b>{was ? qtyText(was.quantity, was.sellBy, t) : ""} → {l.quantity === 0 ? t("apr.removed") : qtyText(l.quantity, was?.sellBy, t)}</b>
          </li>
        );
      })}
      {["address", "note", "timeNote", "deliveryDate"].filter((f) => f in c).map((f) => (
        <li key={f}><span>{t(`apr.field.${f}`)}</span><b>{b[f] || "—"} → {c[f] || "—"}</b></li>
      ))}
    </ul>
  );
}
