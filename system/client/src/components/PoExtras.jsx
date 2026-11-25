import React, { useState } from "react";
import { api } from "../api/client.js";
import { useI18n } from "../context/LanguageContext.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { statusLabel } from "../utils/statusLabels.js";
import { formatDate, qatarYmd } from "../utils/qatarDate.js";
import { FileLink, ProofUpload, money, proofNeeded } from "./BizShared.jsx";

function dayText(day, locale) {
  return day ? formatDate(`${String(day).slice(0, 10)}T12:00:00Z`, locale) : "—";
}

/**
 * Purchase-order money and documents: paid vs received, attachments (quotation / invoice),
 * prepayment (deposit before goods arrive) and freight bills (landed cost).
 */
export function PoExtras({ order, suppliers, onChanged, setMsg }) {
  const { t, locale } = useI18n();
  const { canModule } = useAuth();
  const canCreate = canModule("purchasing", "create");
  const [busy, setBusy] = useState(false);
  const [prepay, setPrepay] = useState({ amount: "", method: "BANK", reference: "", proofFileId: "" });
  const [freight, setFreight] = useState({ freightCompanyId: "", amount: "", reference: "", dueDate: "", proofFileId: "" });
  const [keys, setKeys] = useState({ prepay: 0, freight: 0, attach: 0 });
  const m = order.money || {};
  const freightCompanies = suppliers.filter((s) => s.isFreight && s.isActive !== false);
  const freightBills = (order.bills || []).filter((b) => b.kind === "FREIGHT");

  const run = async (fn, done, key) => {
    if (busy) return;
    setBusy(true);
    setMsg("");
    try {
      await fn();
      setMsg(done);
      if (key) setKeys((k) => ({ ...k, [key]: k[key] + 1 }));
      await onChanged();
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  };

  const upload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    run(() => api(`/api/purchase-orders/${order.id}/attachments`, { method: "POST", body: fd }), t("so.attached"), "attach");
  };

  return (
    <details className="biz-sub">
      <summary>
        {t("so.poMoneyDocs")} · {t("so.paid")} {money(m.paid)} / {t("so.receivedValue")} {money(m.received)} ({statusLabel("paidStatus", m.paidStatus, locale)})
        {(order.attachments || []).length ? ` · 📎 ${order.attachments.length}` : ""}
      </summary>
      <div className="biz-kpis">
        <div className="biz-kpi"><span>{t("so.orderValue")}</span><strong>{money(m.value)}</strong></div>
        <div className="biz-kpi"><span>{t("so.receivedValue")}</span><strong>{money(m.received)}</strong></div>
        <div className="biz-kpi"><span>{t("so.billed")}</span><strong>{money(m.billed)}</strong></div>
        <div className="biz-kpi"><span>{t("so.paid")}</span><strong>{money(m.paid)}</strong></div>
        <div className="biz-kpi"><span>{t("so.prepaid")}</span><strong>{money(m.prepaid)}</strong></div>
        <div className="biz-kpi"><span>{t("so.freight")}</span><strong>{money(m.freight)}</strong></div>
      </div>
      <div className="fd-muted">
        {t("so.expectedDate")}: {dayText(order.expectedDate, locale)} · {t("so.paymentTerms")}: {order.paymentDueDate ? dayText(order.paymentDueDate, locale) : order.paymentTermsDays != null ? t("so.netDays", { n: order.paymentTermsDays }) : "—"}
      </div>

      <div className="biz-sub">
        <h3>{t("so.attachments")}</h3>
        {(order.attachments || []).map((f) => <FileLink key={f.id} file={f} />)}
        {!(order.attachments || []).length ? <span className="fd-muted">{t("so.noAttachments")}</span> : null}
        {canCreate ? (
          <label className="biz-proof">
            <span>{t("so.attachQuote")}</span>
            <input key={keys.attach} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={upload} disabled={busy} aria-label={t("so.attachQuote")} />
          </label>
        ) : null}
      </div>

      <div className="biz-sub">
        <h3>{t("so.prepayments")}</h3>
        {(order.prepayments || []).map((p) => (
          <div key={p.id} className="biz-pay-row">
            <span>{formatDate(p.paidAt, locale)}</span>
            <strong>{money(p.amount)}</strong>
            <span>{t(`fd.source.${p.method}`)}</span>
            {p.reference ? <span>· {p.reference}</span> : null}
            <span className="fd-muted">{t("so.applied")} {money(p.amountApplied)}</span>
            {p.proofFile ? <FileLink file={p.proofFile} label={t("so.viewProof")} /> : null}
          </div>
        ))}
        {canCreate && order.status !== "CANCELLED" ? (
          <form
            className="biz-grid"
            aria-label={t("so.recordPrepayment")}
            onSubmit={(e) => {
              e.preventDefault();
              if (proofNeeded(prepay.method) && !prepay.proofFileId) return setMsg(t("so.proofRequired"));
              run(async () => {
                await api(`/api/purchase-orders/${order.id}/prepayments`, { method: "POST", body: prepay });
                setPrepay({ amount: "", method: prepay.method, reference: "", proofFileId: "" });
              }, t("so.prepaymentSaved"), "prepay");
            }}
          >
            <label><span>{t("fd.amount")}</span><input type="number" required min="0.01" step="0.01" value={prepay.amount} onChange={(e) => setPrepay({ ...prepay, amount: e.target.value })} aria-label={t("so.prepaymentAmount")} /></label>
            <label>
              <span>{t("fd.paidFrom")}</span>
              <select value={prepay.method} onChange={(e) => setPrepay({ ...prepay, method: e.target.value })} aria-label={t("so.prepaymentMethod")}>
                <option value="CASH">{t("fd.source.CASH")}</option>
                <option value="BANK">{t("fd.source.BANK")}</option>
              </select>
            </label>
            <label><span>{t("so.reference")}</span><input value={prepay.reference} onChange={(e) => setPrepay({ ...prepay, reference: e.target.value })} /></label>
            <ProofUpload key={`p${keys.prepay}`} value={prepay.proofFileId} onChange={(v) => setPrepay((x) => ({ ...x, proofFileId: v }))} required={proofNeeded(prepay.method)} />
            <button type="submit" className="btn-touch" disabled={busy}>{t("so.recordPrepayment")}</button>
          </form>
        ) : null}
      </div>

      <div className="biz-sub">
        <h3>{t("so.freightBills")}</h3>
        {freightBills.map((b) => (
          <div key={b.id} className="biz-pay-row">
            <span>{b.supplier?.name}</span>
            <strong>{money(b.amount)}</strong>
            {b.reference ? <span>· {b.reference}</span> : null}
            <span>{t("so.dueDate")} {dayText(b.dueDate, locale)}</span>
            <span className="fd-muted">{t("so.inStockCost")} {money(b.freightCapitalised)}{Number(b.freightExpensed) ? ` · ${t("so.freightOnSold")} ${money(b.freightExpensed)}` : ""}</span>
            <span>{statusLabel("bill", b.status, locale)}</span>
            {b.proofFile ? <FileLink file={b.proofFile} label={t("so.viewFile")} /> : null}
          </div>
        ))}
        {canCreate && ["SENT", "PARTIALLY_RECEIVED", "RECEIVED"].includes(order.status) ? (
          <form
            className="biz-grid"
            aria-label={t("so.addFreight")}
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                await api(`/api/purchase-orders/${order.id}/freight`, { method: "POST", body: freight });
                setFreight({ freightCompanyId: freight.freightCompanyId, amount: "", reference: "", dueDate: "", proofFileId: "" });
              }, t("so.freightSaved"), "freight");
            }}
          >
            <label>
              <span>{t("so.freightCompany")}</span>
              <select required value={freight.freightCompanyId} onChange={(e) => setFreight({ ...freight, freightCompanyId: e.target.value })} aria-label={t("so.freightCompany")}>
                <option value="">—</option>
                {freightCompanies.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label><span>{t("fd.amount")}</span><input type="number" required min="0.01" step="0.01" value={freight.amount} onChange={(e) => setFreight({ ...freight, amount: e.target.value })} aria-label={t("so.freightAmount")} /></label>
            <label><span>{t("so.reference")}</span><input value={freight.reference} onChange={(e) => setFreight({ ...freight, reference: e.target.value })} /></label>
            <label><span>{t("so.dueDate")}</span><input type="date" min={qatarYmd()} value={freight.dueDate} onChange={(e) => setFreight({ ...freight, dueDate: e.target.value })} /></label>
            <ProofUpload key={`f${keys.freight}`} value={freight.proofFileId} onChange={(v) => setFreight((x) => ({ ...x, proofFileId: v }))} label={t("so.freightDoc")} />
            <button type="submit" className="btn-touch" disabled={busy}>{t("so.addFreight")}</button>
          </form>
        ) : null}
        {!freightCompanies.length && canCreate ? <p className="fd-muted">{t("so.noFreightCompanies")}</p> : null}
        <p className="fd-muted">{t("so.freightRule")}</p>
      </div>
    </details>
  );
}
