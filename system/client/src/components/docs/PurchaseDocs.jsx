import React, { useState } from "react";
import { useI18n } from "../../context/LanguageContext.jsx";
import { branchDisplayName } from "../../utils/displayLabels.js";
import { formatDate, formatDateTime } from "../../utils/qatarDate.js";
import { statusLabel } from "../../utils/statusLabels.js";
import { DocFacts, DocFrame, DocHeader, SignLines, StatusPair, dayText, itemName, methodLabel, money, personName, qtyText, useDocData } from "./DocShared.jsx";

/**
 * fix-rg: purchase-order documents.
 * - mode "po": the purchase order to send to the supplier;
 * - mode "status": status sheet / goods received note (ordered, received, outstanding, receipts,
 *   money, freight) with "paid, not received" / "received, not paid" spelled out.
 */
export function PoDocument({ orderId, mode = "po", onClose }) {
  const { t } = useI18n();
  const [both, setBoth] = useState(false);
  const { data: po, error } = useDocData(`/api/documents/purchase-orders/${orderId}`);
  const tools = (
    <label className="biz-check">
      <input type="checkbox" checked={both} onChange={(e) => setBoth(e.target.checked)} />
      <span>{t("doc.namesBoth")}</span>
    </label>
  );
  return (
    <DocFrame docKey={mode === "po" ? "purchase-order" : "po-status"} onClose={onClose} tools={tools} error={error} loading={!po}>
      {po ? (mode === "po" ? <PoBody po={po} both={both} /> : <PoStatusBody po={po} both={both} />) : null}
    </DocFrame>
  );
}

function termsText(po, t) {
  if (po.paymentTermsDays == null) return "—";
  return po.paymentTermsDays ? t("doc.po.termsNet", { n: po.paymentTermsDays }) : t("doc.po.termsOnReceipt");
}

function SupplierFacts({ po }) {
  const { t, locale } = useI18n();
  const s = po.supplier || {};
  const freightCos = [...new Set((po.freightBills || []).map((b) => b.supplier).filter(Boolean))];
  return (
    <DocFacts
      rows={[
        [t("doc.po.supplier"), <>{s.name}{s.isFreight ? <span className="biz-badge"> {t("doc.po.freightCompany")}</span> : null}</>, "doc-supplier"],
        s.phone || s.email ? [t("doc.tel"), <bdi dir="ltr">{[s.phone, s.email].filter(Boolean).join(" · ")}</bdi>] : null,
        s.address ? [t("doc.address"), s.address] : null,
        [t("doc.po.deliverTo"), branchDisplayName(po.branch || {}, locale)],
        [t("so.freight"), freightCos.length ? t("doc.po.freightOn", { n: freightCos.join(", ") }) : t("doc.po.freightNone")],
      ]}
    />
  );
}

function PoBody({ po, both }) {
  const { t, locale } = useI18n();
  return (
    <>
      <DocHeader title={t("doc.po.title")} reference={po.reference} business={po.business} date={po.createdAt} />
      <div className="rg-doc-cols">
        <SupplierFacts po={po} />
        <DocFacts
          rows={[
            [t("doc.po.orderDate"), formatDate(po.createdAt, locale)],
            [t("doc.po.expected"), dayText(po.expectedDate, locale), "doc-expected"],
            [t("doc.po.terms"), termsText(po, t), "doc-terms"],
            [t("doc.po.dueDate"), po.paymentDueDate ? dayText(po.paymentDueDate, locale) : t("doc.po.dueAfterReceipt"), "doc-due"],
            [t("doc.po.issuedBy"), personName(po.createdBy, locale)],
          ]}
        />
      </div>
      <table>
        <thead>
          <tr><th>#</th><th>{t("doc.product")}</th><th className="num">{t("doc.qty")}</th><th className="num">{t("doc.unitCost")}</th><th className="num">{t("doc.lineTotal")}</th></tr>
        </thead>
        <tbody>
          {po.lines.map((l, i) => (
            <tr key={l.id}>
              <td>{i + 1}</td>
              <td>{itemName(l, locale, both)}{l.sku ? <div className="rg-doc-small">{l.sku}</div> : null}</td>
              <td className="num">{qtyText(l, l.quantity, t)}</td>
              <td className="num">{money(l.unitCost)}{l.sellBy === "WEIGHT" ? ` ${t("doc.perKg")}` : ""}</td>
              <td className="num">{money(l.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="rg-doc-sum">
        <div><span>{t("doc.subtotal")}</span><span>{money(po.subtotal)}</span></div>
        <div className="rg-doc-total"><span>{t("doc.total")}</span><span data-testid="doc-total">{money(po.total)} {t("common.currency")}</span></div>
      </div>
      {po.note ? <p>{t("doc.note")}: {po.note}</p> : null}
      <SignLines labels={[`${t("doc.po.issuedBy")}: ${personName(po.createdBy, locale)}`, t("doc.authorisedBy"), t("doc.signature"), t("doc.stamp")]} />
    </>
  );
}

function PaymentsList({ rows }) {
  const { t, locale } = useI18n();
  if (!rows?.length) return null;
  return (
    <ul className="rg-doc-list">
      {rows.map((p) => (
        <li key={p.id}>
          {formatDate(p.paidAt, locale)} · {money(p.amount)} · {methodLabel(p.method, locale)}{p.reference ? ` · ${p.reference}` : ""} · {p.voucherNo}
          {p.proofAttached ? ` · ${t("doc.proofAttached")}` : ""}
        </li>
      ))}
    </ul>
  );
}

function PoStatusBody({ po, both }) {
  const { t, locale } = useI18n();
  const m = po.money;
  const pair = po.statusPair;
  const lineOf = (id) => po.lines.find((l) => l.id === id);
  return (
    <>
      <DocHeader title={t("doc.po.statusTitle")} reference={po.reference} business={po.business} />
      <div className="rg-doc-cols">
        <SupplierFacts po={po} />
        <DocFacts
          rows={[
            [t("fd.status"), statusLabel("purchaseOrder", po.status, locale)],
            [t("doc.po.orderDate"), formatDate(po.createdAt, locale)],
            [t("doc.po.expected"), dayText(po.expectedDate, locale)],
            [t("doc.po.terms"), termsText(po, t)],
          ]}
        />
      </div>
      <div className="rg-doc-pair"><StatusPair pair={pair} po amounts /></div>
      {pair.situation === "PAID_NOT_DELIVERED" ? <p className="rg-alert" data-testid="doc-alert">{t("doc.po.paidNotReceived", { n: `${money(pair.paidAhead)} ${t("common.currency")}` })}</p> : null}
      {pair.situation === "DELIVERED_NOT_PAID" ? <p className="rg-alert" data-testid="doc-alert">{t("doc.po.receivedNotPaid", { n: `${money(pair.deliveredUnpaid)} ${t("common.currency")}` })}</p> : null}
      <table>
        <thead>
          <tr><th>{t("doc.product")}</th><th className="num">{t("doc.po.ordered")}</th><th className="num">{t("doc.po.received")}</th><th className="num">{t("doc.po.outstanding")}</th></tr>
        </thead>
        <tbody>
          {po.lines.map((l) => (
            <tr key={l.id}>
              <td>{itemName(l, locale, both)}</td>
              <td className="num">{qtyText(l, l.quantity, t)}</td>
              <td className="num">{qtyText(l, l.quantityReceived, t)}</td>
              <td className="num"><strong>{qtyText(l, l.outstanding, t)}</strong></td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>{t("doc.po.receipts")}</h3>
      {po.receipts.length ? (
        <ul className="rg-doc-list" data-testid="doc-receipts">
          {po.receipts.map((r, i) => (
            <li key={r.billId}>
              <strong>{t("doc.po.receiptN", { n: i + 1 })}</strong> · {formatDateTime(r.receivedAt, locale)} · {money(r.amount)} — {r.lines.map((x) => { const l = lineOf(x.lineId); return l ? `${itemName(l, locale, both)} × ${qtyText(l, x.quantity, t)}` : ""; }).join(", ")}
            </li>
          ))}
        </ul>
      ) : <p>{t("doc.po.noReceipts")}</p>}

      <h3>{t("doc.po.money")}</h3>
      <div className="rg-doc-sum rg-doc-sum--wide" data-testid="doc-money">
        <div><span>{t("doc.po.value")}</span><span>{money(m.value)}</span></div>
        <div><span>{t("doc.po.receivedValue")}</span><span>{money(m.received)}</span></div>
        <div><span>{t("doc.po.billed")}</span><span>{money(m.billed)}</span></div>
        <div><span>{t("doc.po.prepaid")}</span><span>{money(m.prepaid)}</span></div>
        <div><span>{t("doc.po.paid")}</span><span>{money(m.paid)}</span></div>
        <div className="rg-doc-total"><span>{t("doc.po.balance")}</span><span>{money(m.balance)} {t("common.currency")}</span></div>
      </div>

      {po.goodsBills.length ? (
        <>
          <h3>{t("doc.po.goodsBills")}</h3>
          {po.goodsBills.map((b) => (
            <div key={b.id} className="rg-doc-bill">
              {formatDate(b.createdAt, locale)} · {money(b.amount)} · {t("doc.po.paid")} {money(b.amountPaid)} · {t("so.dueDate")} {dayText(b.dueDate, locale)} · {statusLabel("bill", b.status, locale)}
              <PaymentsList rows={b.payments} />
            </div>
          ))}
        </>
      ) : null}
      {po.prepayments.length ? (
        <>
          <h3>{t("doc.po.prepaid")}</h3>
          <PaymentsList rows={po.prepayments} />
        </>
      ) : null}
      <h3>{t("doc.po.freightBills")}</h3>
      {po.freightBills.length ? po.freightBills.map((b) => (
        <div key={b.id} className="rg-doc-bill">
          {b.supplier}{b.reference ? ` · ${b.reference}` : ""} · {money(b.amount)} · {t("doc.po.paid")} {money(b.amountPaid)} · {t("so.dueDate")} {dayText(b.dueDate, locale)} · {statusLabel("bill", b.status, locale)}
          <PaymentsList rows={b.payments} />
        </div>
      )) : <p>{t("doc.po.noFreight")}</p>}
      <SignLines labels={[t("doc.po.receivedBy"), t("doc.signature"), t("doc.date")]} />
    </>
  );
}

/** Supplier payment voucher: a bill payment, a freight-bill payment or a prepayment. */
export function SupplierVoucher({ kind, id, onClose }) {
  const { t, locale } = useI18n();
  const { data: v, error } = useDocData(`/api/documents/supplier-vouchers/${kind}/${id}`);
  const title = v?.kind === "PREPAYMENT" ? t("doc.v.titlePrepay") : v?.kind === "FREIGHT_PAYMENT" ? t("doc.v.titleFreight") : t("doc.v.title");
  return (
    <DocFrame docKey="supplier-voucher" onClose={onClose} error={error} loading={!v}>
      {v ? (
        <>
          <DocHeader title={title} reference={v.voucherNo} business={v.business} date={v.paidAt} />
          <p className="rg-doc-amount">{t("doc.amount")}: <strong data-testid="doc-amount">{money(v.amount)} {t("common.currency")}</strong></p>
          <DocFacts
            rows={[
              [t("doc.v.paidTo"), v.supplier?.name, "doc-supplier"],
              [t("doc.method"), methodLabel(v.method, locale), "doc-method"],
              [t("doc.reference"), v.reference || "—", "doc-reference"],
              [t("doc.date"), formatDateTime(v.paidAt, locale)],
              [t("doc.v.paidBy"), personName(v.paidBy, locale)],
              v.purchaseOrderReference ? [t("doc.v.forPo"), v.purchaseOrderReference, "doc-po"] : null,
              v.bill ? [t("doc.v.forBill"), `${statusLabel("billKind", v.bill.kind, locale)}${v.bill.reference ? ` · ${v.bill.reference}` : ""} · ${formatDate(v.bill.createdAt, locale)}`] : null,
              v.bill ? [t("doc.v.billAmount"), money(v.bill.amount)] : null,
              v.bill ? [t("doc.v.billBalanceAfter"), money(v.bill.balanceAfter), "doc-balance-after"] : null,
              v.kind === "PREPAYMENT" ? [t("doc.v.applied"), money(v.amountApplied)] : null,
              [t("doc.proofAttached"), v.proofAttached ? `✓ ${t("doc.proofAttachedFile", { n: v.proofFileName || "" })}` : t("doc.noProof"), "doc-proof"],
              v.note ? [t("doc.note"), v.note] : null,
            ]}
          />
          {v.kind === "PREPAYMENT" ? <p className="rg-doc-small">{t("doc.v.prepayNote")}</p> : null}
          <SignLines labels={[`${t("doc.v.paidBy")}: ${personName(v.paidBy, locale)}`, t("doc.authorisedBy"), t("doc.v.receivedBySupplier"), t("doc.signature")]} />
        </>
      ) : null}
    </DocFrame>
  );
}
