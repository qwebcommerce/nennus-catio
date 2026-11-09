import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client.js";
import { useI18n } from "../context/LanguageContext.jsx";
import { useActiveBranchId } from "../context/BranchContext.jsx";
import { useToast } from "../context/ToastContext.jsx";
import { usePrintSettings } from "../context/PrintSettingsContext.jsx";
import { branchDisplayName } from "../utils/displayLabels.js";
import { InvoicePrint } from "../components/InvoicePrint.jsx";
import { PaymentReceiptPrint } from "../components/PaymentReceiptPrint.jsx";
import { useAuth } from "../context/AuthContext.jsx";

function paymentLabel(t, method) {
  const m = String(method || "").toUpperCase();
  if (m === "CASH") return t("payment.cash");
  if (m === "CARD") return t("payment.card");
  if (m === "ONLINE") return t("payment.online");
  if (m === "SPLIT") return t("payment.split");
  if (m === "ON_ACCOUNT") return t("payment.onAccount");
  if (m === "ON_DELIVERY") return t("payment.onDelivery");
  return method || "—";
}

export default function CustomerReceivables() {
  const { t, locale } = useI18n();
  const { user, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const { classFor } = usePrintSettings();
  const branchId = useActiveBranchId();
  const [txns, setTxns] = useState([]);
  const [debts, setDebts] = useState([]);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [printSale, setPrintSale] = useState(null);
  const [printCollection, setPrintCollection] = useState(null);
  const [printBusyId, setPrintBusyId] = useState("");

  const load = useCallback(async () => {
    if (authLoading || !user) return;
    setMsg("");
    setLoading(true);
    try {
      const p = new URLSearchParams();
      p.set("limit", "200");
      if (branchId) p.set("branchId", branchId);
      const [transactions, debtList] = await Promise.all([
        api(`/api/customer-accounts/transactions?${p.toString()}`),
        api("/api/customer-accounts?debtsOnly=1"),
      ]);
      setTxns(Array.isArray(transactions) ? transactions : []);
      setDebts(Array.isArray(debtList) ? debtList : []);
    } catch (e) {
      if (e?.status === 401) {
        setMsg(t("accounts.needLogin"));
      } else {
        setMsg(e.message || t("receivable.loadError"));
      }
      setTxns([]);
      setDebts([]);
    } finally {
      setLoading(false);
    }
  }, [authLoading, user, branchId, t]);

  useEffect(() => {
    load();
  }, [load]);

  const printReceipt = async (row) => {
    setPrintBusyId(row.id);
    setPrintSale(null);
    setPrintCollection(null);
    try {
      if (row.kind === "SALE") {
        const saleId = String(row.id).replace(/^sale:/, "");
        const sale = await api(`/api/sales/${encodeURIComponent(saleId)}`);
        setPrintSale(sale);
        setTimeout(() => window.print(), 200);
      } else {
        setPrintCollection(row);
        setTimeout(() => window.print(), 200);
      }
    } catch (e) {
      showToast(e.message || t("accounts.printFailed"), "error");
    } finally {
      setPrintBusyId("");
    }
  };

  const paperClass =
    printSale?.channel === "WHOLESALE" ? classFor("wholesale") : classFor("retail");

  return (
    <div className="accounts-page">
      <header className="accounts-page__header">
        <div>
          <h1 className="accounts-page__title">{t("nav.accounts")}</h1>
          <p className="accounts-page__intro">{t("accounts.intro")}</p>
        </div>
        <button
          type="button"
          className="btn-touch"
          style={{ background: "var(--surface2)" }}
          onClick={() => load()}
          disabled={loading || authLoading}
        >
          {loading ? t("common.loading") : t("pos.refresh")}
        </button>
      </header>

      {msg ? <p style={{ color: "var(--danger)" }}>{msg}</p> : null}

      <section className="card accounts-section">
        <div className="accounts-section__head">
          <h2>{t("accounts.transactionsTitle")}</h2>
          <span className="accounts-section__count">
            {loading ? t("common.loading") : t("accounts.txnCount", { n: txns.length })}
          </span>
        </div>
        <div className="accounts-table-wrap">
          <table className="accounts-table">
            <thead>
              <tr>
                <th>{t("receivable.colDate")}</th>
                <th>{t("accounts.colKind")}</th>
                <th>{t("receivable.method")}</th>
                <th>{t("receivable.colAmount")}</th>
                <th>{t("customers.name")}</th>
                <th>{t("products.branch")}</th>
                <th>{t("receivable.colBy")}</th>
                <th>{t("receivable.colSale")}</th>
                <th>{t("accounts.colPrint")}</th>
              </tr>
            </thead>
            <tbody>
              {!loading && txns.length === 0 ? (
                <tr>
                  <td colSpan={9} className="accounts-table__empty">
                    {t("accounts.txEmpty")}
                  </td>
                </tr>
              ) : (
                txns.map((row) => (
                  <tr key={row.id}>
                    <td className="accounts-table__nowrap">{new Date(row.createdAt).toLocaleString()}</td>
                    <td>
                      <span className={`accounts-kind accounts-kind--${row.kind === "COLLECTION" ? "collect" : "sale"}`}>
                        {row.kind === "COLLECTION" ? t("accounts.kindCollect") : t("accounts.kindSale")}
                      </span>
                    </td>
                    <td>{paymentLabel(t, row.paymentMethod)}</td>
                    <td className="accounts-table__amount">
                      {Number(row.amount ?? 0).toFixed(2)} {t("common.currency")}
                    </td>
                    <td>{row.customer?.name || "—"}</td>
                    <td>{row.branch ? branchDisplayName(row.branch, locale) : "—"}</td>
                    <td>{row.user?.name || "—"}</td>
                    <td>{row.invoiceNumber || "—"}</td>
                    <td>
                      <button
                        type="button"
                        className="btn-touch accounts-print-btn"
                        disabled={printBusyId === row.id}
                        onClick={() => printReceipt(row)}
                      >
                        {printBusyId === row.id ? t("common.loading") : t("accounts.printReceipt")}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card accounts-section">
        <div className="accounts-section__head">
          <h2>{t("accounts.debtsTitle")}</h2>
          <span className="accounts-section__count">{t("accounts.debtCount", { n: debts.length })}</span>
        </div>
        <p className="accounts-section__hint">{t("receivable.listIntro")}</p>
        <div className="accounts-table-wrap">
          <table className="accounts-table">
            <thead>
              <tr>
                <th>{t("customers.name")}</th>
                <th>{t("customers.phone")}</th>
                <th>{t("customers.colBalance")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {debts.length === 0 ? (
                <tr>
                  <td colSpan={4} className="accounts-table__empty">
                    {t("receivable.empty")}
                  </td>
                </tr>
              ) : (
                debts.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td>{c.phone || "—"}</td>
                    <td className="accounts-table__amount">
                      {Number(c.accountBalance ?? 0).toFixed(2)} {t("common.currency")}
                    </td>
                    <td>
                      <Link
                        to={`/customer-accounts/${c.id}`}
                        className="btn-touch accounts-open"
                        style={{ textDecoration: "none", display: "inline-block" }}
                      >
                        {t("receivable.open")}
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div
        className={`print-invoice ${paperClass}`}
        style={{ position: "fixed", left: -99999, top: 0, width: 400 }}
        aria-hidden="true"
      >
        {printSale ? (
          <InvoicePrint sale={printSale} branchName={printSale.branch?.name} taxInfo={user?.tax} />
        ) : printCollection ? (
          <PaymentReceiptPrint txn={printCollection} />
        ) : null}
      </div>
    </div>
  );
}
