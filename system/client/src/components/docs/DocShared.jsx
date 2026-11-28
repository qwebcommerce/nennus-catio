import React, { useEffect, useRef, useState } from "react";
import { api, editErrorMessage } from "../../api/client.js";
import { useI18n } from "../../context/LanguageContext.jsx";
import { formatDate, formatDateTime } from "../../utils/qatarDate.js";
import { statusLabel } from "../../utils/statusLabels.js";

/**
 * fix-rg: pieces shared by the printable documents (purchase order, status sheet / goods received,
 * supplier payment voucher, sales-order receipt and delivery note) and the payment / delivery badges.
 * A document is a `print-invoice` block: the print CSS (index.css, @media print) shows only it.
 */

export const money = (n) => Number(n || 0).toFixed(2);

export function dayText(day, locale) {
  return day ? formatDate(`${String(day).slice(0, 10)}T12:00:00Z`, locale) : "—";
}

export function personName(p, locale) {
  if (!p) return "—";
  return (locale === "en" ? p.nameEn || p.name : p.name || p.nameEn) || "—";
}

export function methodLabel(method, locale) {
  return statusLabel("payment", method, locale);
}

/** Item name in the UI language, or both languages ("Arabic / English") when `both`. */
export function itemName(l, locale, both = false) {
  const ar = `${l.productName || ""}${l.variant ? ` (${l.variant})` : ""}`;
  const en = `${l.productNameEn || l.productName || ""}${l.variantEn ? ` (${l.variantEn})` : ""}`;
  if (both) return ar === en ? en : locale === "en" ? `${en} / ${ar}` : `${ar} / ${en}`;
  return locale === "en" ? en : ar;
}

/** Quantity with its unit: weight goods are stored in grams and printed in kg. */
export function qtyText(l, n, t) {
  if (l.sellBy === "WEIGHT") return `${(Number(n || 0) / 1000).toFixed(3)} ${t("so.kg")}`;
  return String(n ?? 0);
}

let businessCache = null;
/** Business header for documents (name, contact, CR, VAT, logo), fetched once. */
export function useBusiness(initial) {
  const [biz, setBiz] = useState(initial || null);
  useEffect(() => {
    if (initial) return undefined;
    let alive = true;
    businessCache = businessCache || api("/api/documents/business").catch(() => null);
    businessCache.then((b) => alive && setBiz(b));
    return () => {
      alive = false;
    };
  }, [initial]);
  return biz;
}

/** Logo, business details, title, reference and the printed-on time. */
export function DocHeader({ title, reference, business, date }) {
  const { t, locale } = useI18n();
  const biz = useBusiness(business);
  return (
    <header className="rg-doc-head">
      <div className="rg-doc-biz">
        {biz?.logoUrl ? <img src={biz.logoUrl} alt="" /> : null}
        <div>
          <strong className="rg-doc-bizname">{biz?.legalName || biz?.name || ""}</strong>
          {biz?.legalName && biz?.name && biz.legalName !== biz.name ? <div>{biz.name}</div> : null}
          {biz?.address ? <div>{biz.address}{biz.city ? `, ${biz.city}` : ""}</div> : null}
          <div className="rg-doc-small">
            {[biz?.phone ? `${t("doc.tel")} ${biz.phone}` : "", biz?.email || "", biz?.crNumber ? `${t("doc.cr")} ${biz.crNumber}` : "", biz?.vatNumber ? `${t("doc.vat")} ${biz.vatNumber}` : ""].filter(Boolean).join(" · ")}
          </div>
        </div>
      </div>
      <div className="rg-doc-title">
        <h2>{title}</h2>
        {reference ? <div className="rg-doc-ref" data-testid="doc-ref">{reference}</div> : null}
        {date ? <div>{t("doc.date")}: {formatDate(date, locale)}</div> : null}
        <div className="rg-doc-small">{t("doc.printedOn")} {formatDateTime(new Date(), locale)}</div>
      </div>
    </header>
  );
}

/**
 * The document with its toolbar (print, close, extra tools). Only one document is open per screen so
 * printing never mixes two. `docKey` goes to data-doc for tests and print checks.
 */
/**
 * While a document is open, printing shows only it: its ancestors are marked `rg-print-path` and the
 * body `rg-doc-open`; the print CSS hides everything else with display:none (no blank pages left by
 * hidden content), and the document flows from the top of the page at A4 width (or the phone's).
 */
export function usePrintOnly() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const marked = [];
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      n.classList.add("rg-print-path");
      marked.push(n);
    }
    document.body.classList.add("rg-doc-open");
    return () => {
      marked.forEach((n) => n.classList.remove("rg-print-path"));
      if (!document.querySelector(".rg-doc-live")) document.body.classList.remove("rg-doc-open");
    };
  });
  return ref;
}

export function DocFrame({ docKey, onClose, tools = null, error = "", loading = false, children }) {
  const { t } = useI18n();
  const ref = usePrintOnly();
  return (
    <section className="rg-doc-wrap" aria-label={docKey}>
      <div className="biz-actions rg-doc-tools">
        <button type="button" className="btn-touch biz-primary" onClick={() => window.print()} disabled={loading || !!error}>{t("doc.print")}</button>
        {tools}
        <button type="button" className="btn-touch" onClick={onClose}>{t("doc.close")}</button>
      </div>
      {error ? <div role="alert" className="fd-alert">{error}</div> : null}
      {loading && !error ? <div className="card">{t("doc.loading")}</div> : null}
      {!loading && !error ? (
        <div ref={ref} className="print-invoice biz-print-doc rg-doc rg-doc-live" data-doc={docKey}>
          {children}
        </div>
      ) : null}
    </section>
  );
}

/** Loads one document's data; errors come back in both languages through editErrorMessage. */
export function useDocData(path) {
  const { t } = useI18n();
  const [state, setState] = useState({ data: null, error: "" });
  useEffect(() => {
    let alive = true;
    setState({ data: null, error: "" });
    api(path)
      .then((data) => alive && setState({ data, error: "" }))
      .catch((e) => alive && setState({ data: null, error: editErrorMessage(e, t) || e.message }));
    return () => {
      alive = false;
    };
  }, [path]);
  return state;
}

/** Two-column label / value rows. */
export function DocFacts({ rows }) {
  return (
    <dl className="rg-doc-facts">
      {rows.filter(Boolean).map(([label, value, testId]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd data-testid={testId || undefined}>{value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function SignLines({ labels }) {
  return (
    <div className="rg-sign">
      {labels.map((l) => <div key={l}>{l}</div>)}
    </div>
  );
}

const PAY_TONE = { PAID: "ok", PART_PAID: "warn", UNPAID: "" };
const DEL_TONE = { DELIVERED: "ok", PART_DELIVERED: "warn", NOT_DELIVERED: "" };

/**
 * The two statuses side by side: payment (Unpaid / Partly paid / Paid, + awaiting confirmation) and
 * delivery (Not / Partly / Delivered; "received" for purchase orders), and a warning badge when one
 * side is ahead (paid, not delivered / delivered, not paid).
 */
export function StatusPair({ pair, po = false, amounts = false }) {
  const { t } = useI18n();
  if (!pair) return null;
  const awaiting = Number(pair.awaiting || 0);
  const ahead = pair.situation === "PAID_NOT_DELIVERED" || pair.situation === "DELIVERED_NOT_PAID";
  const cls = (tone) => `biz-badge rg-badge${tone ? ` biz-badge--${tone}` : ""}`;
  return (
    <span className="rg-pair">
      <span className={cls(PAY_TONE[pair.paymentState])} data-testid="st-pay" data-state={pair.paymentState}>
        {t("st.payment")}: {t(`st.pay.${pair.paymentState}`)}
      </span>
      {awaiting > 0 ? (
        <span className={cls("warn")} data-testid="st-await">{t("st.awaitingAmount", { n: money(awaiting) })}</span>
      ) : null}
      <span className={cls(DEL_TONE[pair.deliveryState])} data-testid="st-del" data-state={pair.deliveryState}>
        {t(po ? "st.receipt" : "st.delivery")}: {t(`${po ? "st.rcv" : "st.del"}.${pair.deliveryState}`)}
      </span>
      {ahead ? (
        <span className={cls("bad")} data-testid="st-sit" data-state={pair.situation}>
          {amounts
            ? pair.situation === "PAID_NOT_DELIVERED"
              ? t(po ? "st.paidAheadPo" : "st.paidAhead", { n: money(pair.paidAhead) })
              : t(po ? "st.receivedUnpaid" : "st.deliveredUnpaid", { n: money(pair.deliveredUnpaid) })
            : t(`${po ? "st.sitPo" : "st.sit"}.${pair.situation}`)}
        </span>
      ) : null}
    </span>
  );
}

/** List filters: payment, delivery (receipt) and situation; values go to ?payment= &delivery= &situation=. */
export function StatusFilters({ value, onChange, po = false }) {
  const { t } = useI18n();
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value });
  return (
    <>
      <label>
        <span>{t("st.sit.label")}</span>
        <select value={value.situation || ""} onChange={set("situation")} aria-label={t("st.sit.label")}>
          <option value="">{t("st.filterAll")}</option>
          {["PAID_NOT_DELIVERED", "DELIVERED_NOT_PAID", "PARTIAL", "OPEN", "SETTLED"].map((s) => (
            <option key={s} value={s}>{t(`${po ? "st.sitPo" : "st.sit"}.${s}`)}</option>
          ))}
        </select>
      </label>
      <label>
        <span>{t("st.filterPayment")}</span>
        <select value={value.payment || ""} onChange={set("payment")} aria-label={t("st.filterPayment")}>
          <option value="">{t("st.filterAll")}</option>
          {["UNPAID", "PART_PAID", "PAID", ...(po ? [] : ["AWAITING"])].map((s) => <option key={s} value={s}>{t(`st.pay.${s}`)}</option>)}
        </select>
      </label>
      <label>
        <span>{t(po ? "st.filterReceipt" : "st.filterDelivery")}</span>
        <select value={value.delivery || ""} onChange={set("delivery")} aria-label={t(po ? "st.filterReceipt" : "st.filterDelivery")}>
          <option value="">{t("st.filterAll")}</option>
          {["NOT_DELIVERED", "PART_DELIVERED", "DELIVERED"].map((s) => <option key={s} value={s}>{t(`${po ? "st.rcv" : "st.del"}.${s}`)}</option>)}
        </select>
      </label>
    </>
  );
}

export function statusQuery(value) {
  const qs = new URLSearchParams();
  for (const k of ["payment", "delivery", "situation"]) if (value?.[k]) qs.set(k, value[k]);
  return qs.toString();
}
