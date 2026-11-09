import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client.js";
import { useI18n } from "../context/LanguageContext.jsx";
import { useOrgCurrency } from "../lib/orgCurrency.js";
import { useBranchContext } from "../context/BranchContext.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { productDisplayName } from "../utils/productName.js";

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

export default function StockBalancer() {
  const { t, locale } = useI18n();
  const { format: cur } = useOrgCurrency();
  const { setActiveBranchId } = useBranchContext();
  const [lookbackDays, setLookbackDays] = useState("30");
  const [overview, setOverview] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [selected, setSelected] = useState({});
  const [qtyOverride, setQtyOverride] = useState({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [switchHint, setSwitchHint] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const q = new URLSearchParams({
        lookbackDays: String(Math.max(7, Number(lookbackDays) || 30)),
      });
      // Single request — overview previously duplicated the same heavy scan.
      const sug = await api(`/api/intelligence/balancer/suggestions?${q}`);
      const list = Array.isArray(sug?.suggestions) ? sug.suggestions : [];
      setSuggestions(list);
      setOverview({
        lookbackDays: sug?.lookbackDays,
        branchCount: sug?.branchCount,
        count: sug?.count ?? list.length,
        critical: list.filter((s) => s.severity === "CRITICAL").length,
        high: list.filter((s) => s.severity === "HIGH").length,
        estimatedAvoidedPurchases: sug?.estimatedAvoidedPurchases ?? 0,
      });
      setSelected({});
      setQtyOverride({});
    } catch (e) {
      setErr(e?.message || t("stockBalancer.loadFailed"));
      setOverview(null);
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, [lookbackDays, t]);

  useEffect(() => {
    load();
  }, [load]);

  const selectedLines = useMemo(
    () =>
      suggestions
        .filter((s) => selected[s.id])
        .map((s) => ({
          productId: s.productId,
          fromBranchId: s.fromBranchId,
          toBranchId: s.toBranchId,
          quantity: Math.max(
            1,
            Math.floor(Number(qtyOverride[s.id] ?? s.suggestedQty) || 1),
          ),
        })),
    [suggestions, selected, qtyOverride],
  );

  async function executeSelected() {
    if (!selectedLines.length) {
      setErr(t("stockBalancer.needPick"));
      return;
    }
    setBusy(true);
    setErr("");
    setMsg("");
    setSwitchHint(null);
    try {
      const res = await api("/api/intelligence/balancer/execute", {
        method: "POST",
        body: { lines: selectedLines },
      });
      const destIds = [...new Set(selectedLines.map((l) => l.toBranchId).filter(Boolean))];
      const destNames = [
        ...new Set(
          selectedLines
            .map((l) => suggestions.find((s) => s.id && s.toBranchId === l.toBranchId)?.toBranchName)
            .filter(Boolean),
        ),
      ];
      setMsg(
        t("stockBalancer.executed", { n: String(res?.transferCount || 1) }) +
          (destNames.length
            ? ` — ${t("stockBalancer.switchToSee", { branch: destNames.join(", ") })}`
            : ""),
      );
      if (destIds.length === 1) {
        setSwitchHint({ branchId: destIds[0], name: destNames[0] || destIds[0] });
      }
      await load();
    } catch (e) {
      setErr(e?.message || t("stockBalancer.executeFailed"));
    } finally {
      setBusy(false);
    }
  }

  function toggleAll(on) {
    if (!on) {
      setSelected({});
      return;
    }
    const next = {};
    for (const s of suggestions) next[s.id] = true;
    setSelected(next);
  }

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
          <h1 style={{ margin: 0 }}>{t("stockBalancer.title")}</h1>
          <p style={{ margin: "6px 0 0", color: "var(--muted)", maxWidth: 640 }}>
            {t("stockBalancer.intro")}
          </p>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <label style={{ fontSize: 12, color: "var(--muted)" }}>
            {t("stockBalancer.lookback")}
            <input
              type="number"
              min={7}
              max={120}
              value={lookbackDays}
              onChange={(e) => setLookbackDays(e.target.value)}
              style={{ ...inp, width: 88, marginInlineStart: 6 }}
            />
          </label>
          <button type="button" className="btn" onClick={load} disabled={loading}>
            {loading ? t("stockBalancer.loading") : t("stockBalancer.refresh")}
          </button>
          <Link to="/transfer" className="btn secondary" style={{ textDecoration: "none" }}>
            {t("stockBalancer.openTransfer")}
          </Link>
          <Link to="/stock-brain" className="btn secondary" style={{ textDecoration: "none" }}>
            {t("stockBalancer.openStock")}
          </Link>
        </div>
      </header>

      {err ? <div className="card" style={{ padding: 12, color: "#b91c1c" }}>{err}</div> : null}
      {msg ? <div className="card" style={{ padding: 12, color: "#15803d" }}>{msg}</div> : null}
      {switchHint ? (
        <div className="card" style={{ padding: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ color: "var(--muted)", fontSize: 13 }}>
            {t("stockBalancer.switchToSee", { branch: switchHint.name })}
          </span>
          <button
            type="button"
            className="btn secondary"
            onClick={() => {
              setActiveBranchId(switchHint.branchId);
              setSwitchHint(null);
            }}
          >
            {t("stockBalancer.switchBranch")}
          </button>
        </div>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 12,
        }}
      >
        <Kpi label={t("stockBalancer.kpiMoves")} value={String(overview?.count ?? "—")} />
        <Kpi
          label={t("stockBalancer.kpiCritical")}
          value={String(overview?.critical ?? "—")}
          hint={t("stockBalancer.kpiHigh", { n: String(overview?.high ?? 0) })}
        />
        <Kpi
          label={t("stockBalancer.kpiBranches")}
          value={String(overview?.branchCount ?? "—")}
        />
        <Kpi
          label={t("stockBalancer.kpiSavings")}
          value={overview ? cur(overview.estimatedAvoidedPurchases || 0) : "—"}
          hint={t("stockBalancer.kpiSavingsHint")}
        />
      </div>

      <section className="card" style={{ padding: 16, overflowX: "auto" }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>
            {t("stockBalancer.listIntro")}
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn secondary" onClick={() => toggleAll(true)}>
              {t("stockBalancer.selectAll")}
            </button>
            <button type="button" className="btn secondary" onClick={() => toggleAll(false)}>
              {t("stockBalancer.clearSel")}
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy || !selectedLines.length}
              onClick={executeSelected}
            >
              {busy
                ? t("stockBalancer.executing")
                : t("stockBalancer.execute", { n: String(selectedLines.length) })}
            </button>
          </div>
        </div>

        {suggestions.length === 0 ? (
          <EmptyState title={t("stockBalancer.empty")} />
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                <th style={th} />
                <th style={th}>{t("stockBalancer.colProduct")}</th>
                <th style={th}>{t("stockBalancer.colFrom")}</th>
                <th style={th}>{t("stockBalancer.colTo")}</th>
                <th style={th}>{t("stockBalancer.colQty")}</th>
                <th style={th}>{t("stockBalancer.colSave")}</th>
                <th style={th}>{t("stockBalancer.colSeverity")}</th>
              </tr>
            </thead>
            <tbody>
              {suggestions.map((s) => (
                <tr key={s.id}>
                  <td style={td}>
                    <input
                      type="checkbox"
                      checked={Boolean(selected[s.id])}
                      onChange={(e) =>
                        setSelected((prev) => ({ ...prev, [s.id]: e.target.checked }))
                      }
                    />
                  </td>
                  <td style={td}>{productDisplayName(s, locale)}</td>
                  <td style={td}>
                    {s.fromBranchName} ({s.fromQty})
                  </td>
                  <td style={td}>
                    {s.toBranchName} ({s.toQty})
                  </td>
                  <td style={td}>
                    <input
                      type="number"
                      min={1}
                      value={qtyOverride[s.id] ?? s.suggestedQty}
                      onChange={(e) =>
                        setQtyOverride((prev) => ({ ...prev, [s.id]: e.target.value }))
                      }
                      style={{ ...inp, padding: 6, width: 72 }}
                    />
                  </td>
                  <td style={td}>{cur(s.avoidedPurchaseValue || 0)}</td>
                  <td style={td}>{s.severity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
