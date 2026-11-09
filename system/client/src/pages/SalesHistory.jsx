import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client.js";
import { InvoicePrint } from "../components/InvoicePrint.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { useI18n } from "../context/LanguageContext.jsx";
import { useActiveBranchId } from "../context/BranchContext.jsx";
import { usePrintSettings } from "../context/PrintSettingsContext.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { buildReceiptPlainText } from "../utils/receiptText.js";
import { apiErrorMessage } from "../utils/apiError.js";

const inp = {
  padding: 12,
  borderRadius: 12,
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
  minHeight: 44,
};

const th = { padding: "8px 6px", borderBottom: "1px solid var(--border)", textAlign: "start" };
const td = { padding: "8px 6px", borderBottom: "1px solid var(--border)", verticalAlign: "top" };

const PAY_FILTERS = ["", "CASH", "CARD", "ONLINE", "ON_ACCOUNT", "ON_DELIVERY", "SPLIT"];

function money(n) {
  return Number(n || 0).toFixed(2);
}

function payLabel(t, method) {
  const m = String(method || "").toUpperCase();
  const map = {
    CASH: "payment.cash",
    CARD: "payment.card",
    ONLINE: "payment.online",
    SPLIT: "payment.split",
    ON_ACCOUNT: "payment.onAccount",
    ON_DELIVERY: "payment.onDelivery",
  };
  return map[m] ? t(map[m]) : method || "—";
}

export default function SalesHistory() {
  const { t, locale } = useI18n();
  const { can, user } = useAuth();
  const { classFor } = usePrintSettings();
  const branchId = useActiveBranchId();
  const navigate = useNavigate();
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 14);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [busyId, setBusyId] = useState("");
  const [printSale, setPrintSale] = useState(null);
  const [expandedId, setExpandedId] = useState("");

  const load = async () => {
    setLoading(true);
    setMsg("");
    try {
      const q = new URLSearchParams();
      if (branchId) q.set("branchId", branchId);
      if (from) q.set("from", new Date(`${from}T00:00:00`).toISOString());
      if (to) q.set("to", new Date(`${to}T23:59:59`).toISOString());
      if (paymentMethod) q.set("paymentMethod", paymentMethod);
      if (searchQ.trim()) q.set("q", searchQ.trim());
      q.set("limit", "100");
      const list = await api(`/api/sales?${q.toString()}`);
      setRows(Array.isArray(list) ? list : []);
    } catch (e) {
      setRows([]);
      setMsg(apiErrorMessage(e, t, "sales.loadFailed"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load().catch(() => {});
  }, [branchId]);

  const confirmDelivery = async (saleId) => {
    setBusyId(saleId);
    setMsg("");
    try {
      await api(`/api/sales/${encodeURIComponent(saleId)}/confirm-delivery`, { method: "POST" });
      setMsg(t("sales.confirmDone"));
      await load();
    } catch (e) {
      setMsg(e.message || t("sales.confirmFail"));
    } finally {
      setBusyId("");
    }
  };

  const reprint = async (saleId) => {
    setBusyId(`print:${saleId}`);
    setMsg("");
    try {
      const sale = await api(`/api/sales/${encodeURIComponent(saleId)}`);
      setPrintSale(sale);
      setTimeout(() => window.print(), 200);
    } catch (e) {
      setMsg(e.message || t("sales.printFailed"));
    } finally {
      setBusyId("");
    }
  };

  const copyReceipt = async (saleId) => {
    setBusyId(`copy:${saleId}`);
    try {
      const sale = await api(`/api/sales/${encodeURIComponent(saleId)}`);
      const text = buildReceiptPlainText(sale, sale.branch?.name, locale, user?.tax);
      await navigator.clipboard.writeText(text);
      setMsg(t("pos.receiptCopied"));
    } catch (e) {
      setMsg(e.message || t("sales.printFailed"));
    } finally {
      setBusyId("");
    }
  };

  const refundFromSale = async (saleId) => {
    setBusyId(`refund:${saleId}`);
    setMsg("");
    try {
      const sale = await api(`/api/sales/${encodeURIComponent(saleId)}`);
      const items = (sale.items || [])
        .filter((it) => it.productId || it.product?.id)
        .map((it) => ({
          productId: it.productId || it.product?.id,
          quantity: String(it.quantity || 1),
        }));
      navigate("/returns", {
        state: {
          saleId: sale.id,
          invoiceNumber: sale.invoiceNumber || "",
          items,
          note: t("sales.refundNote", { inv: sale.invoiceNumber || sale.id.slice(0, 8) }),
        },
      });
    } catch (e) {
      setMsg(e.message || t("sales.refundLoadFailed"));
    } finally {
      setBusyId("");
    }
  };

  const printClass =
    printSale?.channel === "WHOLESALE" ? classFor("wholesale") : classFor("retail");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ margin: 0 }}>{t("sales.title")}</h1>
      <p style={{ margin: 0, color: "var(--muted)", fontSize: 14 }}>{t("sales.intro")}</p>

      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          load();
        }}
        style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}
      >
        <label className="page-form-field" style={{ minWidth: 150 }}>
          <span>{t("reports.from")}</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={inp} />
        </label>
        <label className="page-form-field" style={{ minWidth: 150 }}>
          <span>{t("reports.to")}</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={inp} />
        </label>
        <label className="page-form-field" style={{ minWidth: 150 }}>
          <span>{t("sales.colPayment")}</span>
          <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} style={inp}>
            {PAY_FILTERS.map((p) => (
              <option key={p || "all"} value={p}>
                {p ? payLabel(t, p) : t("sales.allPayments")}
              </option>
            ))}
          </select>
        </label>
        <label className="page-form-field" style={{ flex: 1, minWidth: 180 }}>
          <span>{t("sales.search")}</span>
          <input
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder={t("sales.searchPh")}
            style={inp}
          />
        </label>
        <button type="submit" className="btn-touch" disabled={loading} style={{ background: "var(--accent)", color: "#fff" }}>
          {t("pos.refresh")}
        </button>
      </form>

      {msg ? <div className="card" style={{ color: "var(--muted)", fontSize: 14 }}>{msg}</div> : null}

      <div className="card" style={{ overflowX: "auto" }}>
        {loading ? (
          <div style={{ padding: 16 }}>{t("common.loading")}</div>
        ) : !rows.length ? (
          <EmptyState title={t("sales.empty")} hint={t("sales.emptyHint")} />
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ color: "var(--muted)" }}>
                <th style={th}>{t("returns.colDate")}</th>
                <th style={th}>{t("sales.colInvoice")}</th>
                <th style={th}>{t("sales.colSeller")}</th>
                <th style={th}>{t("sales.colCustomer")}</th>
                <th style={th}>{t("sales.colPayment")}</th>
                <th style={th}>{t("sales.colTotal")}</th>
                <th style={th}>{t("sales.colLoyalty")}</th>
                <th style={th}>{t("automations.thActions")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const canConfirm = s.loyaltyAwardStatus === "PENDING";
                const open = expandedId === s.id;
                return (
                  <React.Fragment key={s.id}>
                    <tr>
                      <td style={td}>
                        {new Date(s.createdAt).toLocaleString(locale === "en" ? "en-GB" : "ar-SA")}
                      </td>
                      <td style={td}>
                        <button
                          type="button"
                          onClick={() => setExpandedId(open ? "" : s.id)}
                          style={{
                            background: "none",
                            border: "none",
                            color: "var(--accent)",
                            cursor: "pointer",
                            padding: 0,
                            font: "inherit",
                            textAlign: "start",
                          }}
                        >
                          <code style={{ fontSize: 12 }}>{s.invoiceNumber || s.id.slice(0, 8)}</code>
                        </button>
                        <div style={{ color: "var(--muted)", fontSize: 11 }}>{s.branch?.name || ""}</div>
                      </td>
                      <td style={td}>
                        <div>
                          {locale === "en" && s.user?.nameEn?.trim()
                            ? s.user.nameEn.trim()
                            : s.user?.name || "—"}
                        </div>
                        <div style={{ color: "var(--muted)", fontSize: 11 }}>
                          {s.user?.role ? t(`role.${s.user.role}`) : ""}
                          {s.user?.email ? ` · ${s.user.email}` : ""}
                        </div>
                      </td>
                      <td style={td}>{s.customer?.name || s.customer?.phone || "—"}</td>
                      <td style={td}>{payLabel(t, s.paymentMethod)}</td>
                      <td style={td}><strong>{money(s.total)}</strong></td>
                      <td style={td}>{s.loyaltyAwardStatus || "—"}</td>
                      <td style={td}>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            className="btn-touch"
                            disabled={busyId === `print:${s.id}`}
                            onClick={() => reprint(s.id)}
                            style={{ fontSize: 12, padding: "6px 10px" }}
                          >
                            {t("sales.reprint")}
                          </button>
                          <button
                            type="button"
                            className="btn-touch"
                            disabled={busyId === `copy:${s.id}`}
                            onClick={() => copyReceipt(s.id)}
                            style={{ fontSize: 12, padding: "6px 10px", background: "var(--surface2)" }}
                          >
                            {t("pos.copyReceipt")}
                          </button>
                          {can("refunds") ? (
                            <button
                              type="button"
                              className="btn-touch"
                              disabled={busyId === `refund:${s.id}`}
                              onClick={() => refundFromSale(s.id)}
                              style={{ fontSize: 12, padding: "6px 10px", background: "var(--warning)", color: "#111" }}
                            >
                              {t("sales.refund")}
                            </button>
                          ) : null}
                          {canConfirm ? (
                            <button
                              type="button"
                              className="btn-touch"
                              disabled={busyId === s.id}
                              onClick={() => confirmDelivery(s.id)}
                              style={{ fontSize: 12, padding: "6px 10px", background: "var(--accent)", color: "#fff" }}
                            >
                              {t("sales.confirmDelivery")}
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                    {open ? (
                      <tr>
                        <td style={td} colSpan={8}>
                          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>
                            {t("sales.lines")}:{" "}
                            {(s.items || [])
                              .map((it) => `${it.product?.name || "?"} ×${it.quantity}`)
                              .join(locale === "en" ? ", " : "، ") || "—"}
                          </div>
                          <Link to={`/returns`} state={{ saleId: s.id }} style={{ fontSize: 12 }}>
                            {t("nav.returns")}
                          </Link>
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className={`print-invoice ${printClass}`} aria-hidden={!printSale}>
        {printSale ? (
          <InvoicePrint sale={printSale} branchName={printSale.branch?.name} taxInfo={user?.tax} />
        ) : null}
      </div>
    </div>
  );
}
