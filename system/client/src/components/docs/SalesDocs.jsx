import React from "react";
import { useI18n } from "../../context/LanguageContext.jsx";
import { branchDisplayName } from "../../utils/displayLabels.js";
import { formatDateTime } from "../../utils/qatarDate.js";
import { DocFacts, DocFrame, DocHeader, SignLines, StatusPair, itemName, methodLabel, money, personName, qtyText, useDocData } from "./DocShared.jsx";

/**
 * fix-rg: sales-order documents — a payment receipt per installment payment and a delivery note per
 * delivery. B2B delivery notes keep their own documents on the B2B tab (the server answers DOC_USE_B2B).
 */

const customerLine = (c) => (c ? `${c.companyName || c.name}${c.companyName ? ` — ${c.name}` : ""}` : "—");

export function SoPaymentReceipt({ orderId, paymentId, onClose }) {
  const { t, locale } = useI18n();
  const { data: r, error } = useDocData(`/api/documents/sales-orders/${orderId}/receipts/${paymentId}`);
  const p = r?.payment;
  return (
    <DocFrame docKey="so-receipt" onClose={onClose} error={error} loading={!r}>
      {r ? (
        <>
          <DocHeader title={t("doc.so.receipt")} reference={r.receiptNo} business={r.business} date={p.paidAt} />
          <p className="rg-doc-amount">{t("doc.amount")}: <strong data-testid="doc-amount">{money(p.amount)} {t("common.currency")}</strong></p>
          {p.confirmStatus === "PENDING_CONFIRMATION" ? <p className="rg-alert" data-testid="doc-confirm" data-status={p.confirmStatus}>{t("doc.so.awaitingNote")}</p> : null}
          {p.confirmStatus === "CONFIRMED" ? (
            <p className="rg-ok" data-testid="doc-confirm" data-status={p.confirmStatus}>
              {t("pc.status.CONFIRMED")}{p.confirmedBy ? ` — ${t("doc.so.confirmedBy", { n: personName(p.confirmedBy, locale) })}` : ""}{p.confirmedAt ? ` · ${formatDateTime(p.confirmedAt, locale)}` : ""}
            </p>
          ) : null}
          {p.confirmStatus === "REJECTED" ? <p className="rg-alert" data-testid="doc-confirm" data-status={p.confirmStatus}>{t("doc.so.rejectedNote", { n: p.rejectReason || "" })}</p> : null}
          <DocFacts
            rows={[
              [t("doc.so.receivedFrom"), customerLine(r.customer), "doc-customer"],
              [t("doc.so.order"), r.orderReference, "doc-order"],
              [t("doc.method"), methodLabel(p.method, locale), "doc-method"],
              [t("doc.reference"), p.reference || "—", "doc-reference"],
              [t("doc.date"), formatDateTime(p.paidAt, locale)],
              [t("doc.so.collectedBy"), personName(p.collectedBy, locale), "doc-collected"],
              [t("doc.so.recordedBy"), personName(p.recordedBy, locale)],
              [t("doc.proofAttached"), p.proofAttached ? "✓" : t("doc.noProof")],
              p.note ? [t("doc.note"), p.note] : null,
            ]}
          />
          <div className="rg-doc-sum rg-doc-sum--wide">
            <div><span>{t("doc.so.orderTotal")}</span><span>{money(r.total)}</span></div>
            <div className="rg-doc-total"><span>{t("doc.so.balanceAfter")}</span><span data-testid="doc-balance-after">{money(p.confirmStatus === "REJECTED" ? r.confirmedBalanceAfter : r.balanceAfter)} {t("common.currency")}</span></div>
            {p.confirmStatus !== "CONFIRMED" || Number(r.now.awaiting) > 0 ? (
              <div><span>{t("doc.so.balanceAfterConfirmed")}</span><span data-testid="doc-balance-confirmed">{money(r.now.balance)}</span></div>
            ) : null}
            {Number(r.now.awaiting) > 0 ? <div><span>{t("doc.so.awaiting")}</span><span>{money(r.now.awaiting)}</span></div> : null}
          </div>
          <div className="rg-doc-pair"><StatusPair pair={r.statusPair} /></div>
          <SignLines labels={[`${t("doc.so.collectedBy")}: ${personName(p.collectedBy, locale)}`, t("doc.signature")]} />
        </>
      ) : null}
    </DocFrame>
  );
}

export function SoDeliveryNote({ orderId, deliveryId, onClose }) {
  const { t, locale } = useI18n();
  const { data: n, error } = useDocData(`/api/documents/sales-orders/${orderId}/deliveries/${deliveryId}`);
  return (
    <DocFrame docKey="so-delivery-note" onClose={onClose} error={error} loading={!n}>
      {n ? (
        <>
          <DocHeader title={t("doc.so.deliveryNote")} reference={n.deliveryNo} business={n.business} date={n.delivery.deliveredAt} />
          <DocFacts
            rows={[
              [t("doc.so.customer"), customerLine(n.customer), "doc-customer"],
              n.customer?.phone ? [t("doc.tel"), <bdi dir="ltr">{n.customer.phone}</bdi>] : null,
              n.customer?.address ? [t("doc.address"), n.customer.address] : null,
              [t("doc.so.order"), n.orderReference, "doc-order"],
              [t("so.sellingLocation"), branchDisplayName(n.branch || {}, locale)],
              [t("doc.date"), formatDateTime(n.delivery.deliveredAt, locale)],
              [t("doc.so.deliveredBy"), personName(n.delivery.deliveredBy, locale)],
            ]}
          />
          <table>
            <thead>
              <tr>
                <th>{t("doc.product")}</th>
                <th className="num">{t("doc.so.ordered")}</th>
                <th className="num">{t("doc.so.deliveredNow")}</th>
                <th className="num">{t("doc.so.deliveredToDate")}</th>
                <th className="num">{t("doc.so.outstanding")}</th>
              </tr>
            </thead>
            <tbody>
              {n.lines.map((l) => (
                <tr key={l.id}>
                  <td>{itemName(l, locale)}{l.isFree ? ` — ${t("doc.free")}` : ""}</td>
                  <td className="num">{qtyText(l, l.quantity, t)}</td>
                  <td className="num"><strong>{qtyText(l, l.deliveredNow, t)}</strong></td>
                  <td className="num">{qtyText(l, l.deliveredToDate, t)}</td>
                  <td className="num">{qtyText(l, l.outstandingAfter, t)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {n.delivery.note ? <p>{t("doc.note")}: {n.delivery.note}</p> : null}
          <SignLines labels={[`${t("doc.so.deliveredBy")}: ${personName(n.delivery.deliveredBy, locale)}`, `${t("doc.so.receivedByCustomer")}: ____________`, t("doc.signature"), t("doc.date")]} />
        </>
      ) : null}
    </DocFrame>
  );
}
