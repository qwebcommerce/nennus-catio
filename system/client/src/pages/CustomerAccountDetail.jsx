import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client.js";
import { useI18n } from "../context/LanguageContext.jsx";
import { useActiveBranchId } from "../context/BranchContext.jsx";

export default function CustomerAccountDetail() {
  const { customerId } = useParams();
  const { t } = useI18n();
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("CASH");
  const [payNote, setPayNote] = useState("");
  const [busy, setBusy] = useState(false);
  const branchId = useActiveBranchId();

  const load = () => {
    setMsg("");
    return api(`/api/customer-accounts/${customerId}/ledger`)
      .then(setData)
      .catch((e) => {
        setMsg(e.message || t("receivable.loadError"));
        setData(null);
      });
  };

  useEffect(() => {
    load();
  }, [customerId]);

  const submitPay = async (e) => {
    e.preventDefault();
    setMsg("");
    setBusy(true);
    try {
      if (!branchId) {
        setMsg(t("receivable.needBranch"));
        return;
      }
      await api(`/api/customer-accounts/${customerId}/payments`, {
        method: "POST",
        body: {
          amount: Number(String(payAmount).replace(",", ".")),
          paymentMethod: payMethod,
          branchId,
          note: payNote.trim() || undefined,
        },
      });
      setPayAmount("");
      setPayNote("");
      setMsg(t("receivable.saved"));
      await load();
    } catch (err) {
      setMsg(err.message || t("receivable.payFailed"));
    } finally {
      setBusy(false);
    }
  };

  if (!data?.customer) {
    return (
      <div className="ca-detail">
        <Link to="/customers" className="ca-detail__back">
          {t("receivable.backCustomers")}
        </Link>
        <p className="ca-detail__msg">{msg || t("common.loading")}</p>
      </div>
    );
  }

  const { customer, entries } = data;
  const bal = Number(customer.accountBalance ?? 0);

  const typeLabel = (et) => {
    if (et === "SALE_CREDIT") return t("receivable.typeSale");
    if (et === "PAYMENT") return t("receivable.typePayment");
    if (et === "ADJUSTMENT") return t("receivable.typeAdjust");
    return et;
  };

  return (
    <div className="ca-detail">
      <Link to="/customers" className="ca-detail__back">
        {t("receivable.backCustomers")}
      </Link>

      <header className="ca-detail__header">
        <div>
          <h1 className="ca-detail__title">{customer.name}</h1>
          <div className="ca-detail__meta">
            {customer.phone ? <span>{customer.phone}</span> : null}
            {customer.email ? <span>{customer.email}</span> : null}
          </div>
        </div>
        <div className={`ca-detail__balance${bal > 0.001 ? " ca-detail__balance--due" : ""}`}>
          <span className="ca-detail__balance-label">{t("receivable.balance")}</span>
          <strong>
            {bal.toFixed(2)} {t("common.currency")}
          </strong>
        </div>
      </header>

      {msg ? <p className="ca-detail__msg">{msg}</p> : null}

      <div className="ca-detail__grid">
        {bal > 0.001 ? (
          <form className="card ca-detail__collect" onSubmit={submitPay}>
            <h2>{t("receivable.collect")}</h2>
            <label className="ca-detail__field">
              <span>{t("receivable.amount")}</span>
              <input
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                inputMode="decimal"
                required
                disabled={busy}
              />
            </label>
            <label className="ca-detail__field">
              <span>{t("receivable.method")}</span>
              <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} disabled={busy}>
                <option value="CASH">{t("payment.cash")}</option>
                <option value="CARD">{t("payment.card")}</option>
                <option value="ONLINE">{t("payment.online")}</option>
              </select>
            </label>
            <label className="ca-detail__field">
              <span>{t("receivable.note")}</span>
              <input value={payNote} onChange={(e) => setPayNote(e.target.value)} disabled={busy} />
            </label>
            <button type="submit" className="btn-touch ca-detail__submit" disabled={busy}>
              {busy ? t("common.loading") : t("receivable.submit")}
            </button>
          </form>
        ) : (
          <div className="card ca-detail__settled">
            <h2>{t("receivable.collect")}</h2>
            <p>{t("receivable.settledHint")}</p>
          </div>
        )}

        <section className="card ca-detail__ledger">
          <div className="ca-detail__ledger-head">
            <h2>{t("receivable.ledger")}</h2>
            <span>{t("accounts.txnCount", { n: (entries || []).length })}</span>
          </div>
          <div className="ca-detail__table-wrap">
            <table className="ca-detail-table">
              <thead>
                <tr>
                  <th>{t("receivable.colDate")}</th>
                  <th>{t("receivable.colType")}</th>
                  <th>{t("receivable.colAmount")}</th>
                  <th>{t("receivable.colSale")}</th>
                  <th>{t("receivable.colBy")}</th>
                </tr>
              </thead>
              <tbody>
                {(entries || []).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="ca-detail-table__empty">
                      {t("receivable.ledgerEmpty")}
                    </td>
                  </tr>
                ) : (
                  (entries || []).map((row) => (
                    <tr key={row.id}>
                      <td className="ca-detail-table__nowrap">{new Date(row.createdAt).toLocaleString()}</td>
                      <td>
                        <span className={`ca-type ca-type--${String(row.entryType || "").toLowerCase()}`}>
                          {typeLabel(row.entryType)}
                        </span>
                      </td>
                      <td className="ca-detail-table__amount">
                        {Number(row.amount).toFixed(2)} {t("common.currency")}
                      </td>
                      <td>
                        {row.saleId ? (
                          <code className="ca-detail-table__sale">{row.saleId.slice(0, 10)}…</code>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>{row.createdBy?.name || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
