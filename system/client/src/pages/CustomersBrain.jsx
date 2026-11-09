import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client.js";
import { useI18n } from "../context/LanguageContext.jsx";
import { useOrgCurrency } from "../lib/orgCurrency.js";
import { EmptyState } from "../components/EmptyState.jsx";

const inp = {
  padding: 12,
  borderRadius: 12,
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
};
const th = { padding: "10px 8px", fontWeight: 600, whiteSpace: "nowrap" };
const td = {
  padding: "10px 8px",
  borderTop: "1px solid var(--border)",
  verticalAlign: "middle",
};

function Kpi({ label, value, hint }) {
  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ fontSize: 12, color: "var(--muted)" }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.2 }}>{value}</div>
      {hint ? <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>{hint}</div> : null}
    </div>
  );
}

export default function CustomersBrain() {
  const { t, locale } = useI18n();
  const { format: cur } = useOrgCurrency();
  const [tab, setTab] = useState("dormant");
  const [dormantDays, setDormantDays] = useState("60");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);

  const loc = locale === "en" ? "en-US" : "ar-SA";

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const q = new URLSearchParams({
        dormantDays: String(Math.max(14, Number(dormantDays) || 60)),
        lookbackDays: "365",
      });
      const board = await api(`/api/intelligence/customers/rfm?${q}`);
      setData(board);
    } catch (e) {
      setErr(e?.message || t("customersBrain.loadFailed"));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [dormantDays, t]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(() => {
    if (!data) return [];
    if (tab === "highValue") return data.highValue || [];
    if (tab === "atRisk") return data.atRisk || [];
    if (tab === "champions") return data.champions || [];
    if (tab === "all") return data.customers || [];
    return data.dormant || [];
  }, [data, tab]);

  const shareBody = useMemo(() => {
    if (!data?.shareText) return "";
    if (tab === "highValue") {
      return locale === "en" ? data.shareText.highValueEn : data.shareText.highValueAr;
    }
    return locale === "en" ? data.shareText.dormantEn : data.shareText.dormantAr;
  }, [data, tab, locale]);

  async function copyShare() {
    const text =
      shareBody ||
      rows
        .filter((r) => r.phone)
        .map((r) => `${r.phone}\t${r.name}\t${r.segment}\t${r.monetary}`)
        .join("\n");
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  function segmentLabel(seg) {
    const key = `customersBrain.segment.${seg}`;
    const tr = t(key);
    return tr === key ? seg : tr;
  }

  const tabs = [
    { id: "dormant", label: t("customersBrain.tabDormant") },
    { id: "highValue", label: t("customersBrain.tabHighValue") },
    { id: "atRisk", label: t("customersBrain.tabAtRisk") },
    { id: "champions", label: t("customersBrain.tabChampions") },
    { id: "all", label: t("customersBrain.tabAll") },
  ];

  return (
    <div className="page" style={{ display: "grid", gap: 16 }}>
      <header
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "flex-start",
          justifyContent: "space-between",
        }}
      >
        <div>
          <h1 style={{ margin: 0 }}>{t("customersBrain.title")}</h1>
          <p style={{ margin: "6px 0 0", color: "var(--muted)", maxWidth: 640 }}>
            {t("customersBrain.intro")}
          </p>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <label style={{ fontSize: 12, color: "var(--muted)" }}>
            {t("customersBrain.dormantDays")}
            <input
              type="number"
              min={14}
              max={365}
              value={dormantDays}
              onChange={(e) => setDormantDays(e.target.value)}
              style={{ ...inp, width: 88, marginInlineStart: 6 }}
            />
          </label>
          <button type="button" className="btn" onClick={load} disabled={loading}>
            {loading ? t("customersBrain.loading") : t("customersBrain.refresh")}
          </button>
          <button
            type="button"
            className="btn secondary"
            onClick={copyShare}
            disabled={!rows.some((r) => r.phone)}
          >
            {copied ? t("customersBrain.copied") : t("customersBrain.copyWhatsApp")}
          </button>
          <Link to="/customers" className="btn secondary" style={{ textDecoration: "none" }}>
            {t("customersBrain.openCustomers")}
          </Link>
          <Link to="/automations" className="btn secondary" style={{ textDecoration: "none" }}>
            {t("customersBrain.openAutomations")}
          </Link>
        </div>
      </header>

      {err ? <div className="card" style={{ padding: 12, color: "#b91c1c" }}>{err}</div> : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 12,
        }}
      >
        <Kpi label={t("customersBrain.kpiCustomers")} value={String(data?.customerCount ?? "—")} />
        <Kpi label={t("customersBrain.kpiDormant")} value={String(data?.dormant?.length ?? "—")} />
        <Kpi
          label={t("customersBrain.kpiHighValue")}
          value={String(data?.highValue?.length ?? "—")}
          hint={
            data?.highValueMin != null
              ? t("customersBrain.kpiHighValueHint", { min: cur(data.highValueMin) })
              : undefined
          }
        />
        <Kpi label={t("customersBrain.kpiAtRisk")} value={String(data?.atRisk?.length ?? "—")} />
        <Kpi
          label={t("customersBrain.kpiChampions")}
          value={String(data?.champions?.length ?? "—")}
        />
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {tabs.map((tb) => (
          <button
            key={tb.id}
            type="button"
            className={tab === tb.id ? "btn" : "btn secondary"}
            onClick={() => setTab(tb.id)}
          >
            {tb.label}
          </button>
        ))}
      </div>

      <section className="card" style={{ padding: 16, overflowX: "auto" }}>
        <p style={{ margin: "0 0 12px", color: "var(--muted)", fontSize: 13 }}>
          {t("customersBrain.listHint")}
        </p>
        {rows.length === 0 ? (
          <EmptyState title={t("customersBrain.empty")} />
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                <th style={th}>{t("customersBrain.colName")}</th>
                <th style={th}>{t("customersBrain.colPhone")}</th>
                <th style={th}>{t("customersBrain.colLast")}</th>
                <th style={th}>{t("customersBrain.colFreq")}</th>
                <th style={th}>{t("customersBrain.colSpend")}</th>
                <th style={th}>{t("customersBrain.colRfm")}</th>
                <th style={th}>{t("customersBrain.colSegment")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={td}>{r.name}</td>
                  <td style={td}>{r.phone || "—"}</td>
                  <td style={td}>
                    {r.lastPurchaseAt
                      ? new Date(r.lastPurchaseAt).toLocaleDateString(loc)
                      : t("customersBrain.never")}
                    {r.daysSinceLastPurchase != null
                      ? ` (${r.daysSinceLastPurchase}d)`
                      : ""}
                  </td>
                  <td style={td}>{r.frequency}</td>
                  <td style={td}>{cur(r.monetary)}</td>
                  <td style={td}>{r.rfm}</td>
                  <td style={td}>{segmentLabel(r.segment)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
