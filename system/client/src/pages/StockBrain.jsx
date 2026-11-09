import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client.js";
import { useI18n } from "../context/LanguageContext.jsx";
import { useActiveBranchId } from "../context/BranchContext.jsx";
import { useOrgCurrency } from "../lib/orgCurrency.js";
import { isVerticalFeatureEnabled } from "../lib/verticalFeatures.js";
import { useAuth } from "../context/AuthContext.jsx";
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
const td = { padding: "10px 8px", borderTop: "1px solid var(--border)", verticalAlign: "middle" };

function severityTone(level) {
  switch (String(level || "").toUpperCase()) {
    case "EXPIRED":
    case "CRITICAL":
      return { bg: "rgba(220, 38, 38, 0.12)", color: "#b91c1c" };
    case "HIGH":
      return { bg: "rgba(234, 88, 12, 0.12)", color: "#c2410c" };
    case "MEDIUM":
      return { bg: "rgba(202, 138, 4, 0.14)", color: "#a16207" };
    default:
      return { bg: "rgba(100, 116, 139, 0.12)", color: "#475569" };
  }
}

function SeverityBadge({ level, t }) {
  const tone = severityTone(level);
  const key = `stockBrain.severity.${String(level || "WATCH").toUpperCase()}`;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        background: tone.bg,
        color: tone.color,
      }}
    >
      {t(key)}
    </span>
  );
}

export default function StockBrain() {
  const { t, locale } = useI18n();
  const { format: cur } = useOrgCurrency();
  const { user } = useAuth();
  const branchId = useActiveBranchId();
  const showWaste = isVerticalFeatureEnabled("lotsExpiry", user?.businessVertical);

  const [tab, setTab] = useState("reorder");
  const [lookbackDays, setLookbackDays] = useState("30");
  const [targetStockDays, setTargetStockDays] = useState("21");
  const [withinDays, setWithinDays] = useState("30");
  const [overview, setOverview] = useState(null);
  const [reorder, setReorder] = useState([]);
  const [waste, setWaste] = useState([]);
  const [wasteTotals, setWasteTotals] = useState(null);
  const [drafts, setDrafts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [supplierId, setSupplierId] = useState("");
  const [selected, setSelected] = useState({});
  const [qtyOverride, setQtyOverride] = useState({});
  const [costOverride, setCostOverride] = useState({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const loc = locale === "en" ? "en-US" : "ar-SA";

  useEffect(() => {
    api("/api/suppliers")
      .then(setSuppliers)
      .catch(() => setSuppliers([]));
  }, []);

  const loadAll = useCallback(async () => {
    if (!branchId) {
      setOverview(null);
      setReorder([]);
      setWaste([]);
      setDrafts([]);
      return;
    }
    setLoading(true);
    setErr("");
    try {
      const q = new URLSearchParams({
        branchId,
        lookbackDays: String(Math.max(7, Number(lookbackDays) || 30)),
        targetStockDays: String(Math.max(7, Number(targetStockDays) || 21)),
        wasteWithinDays: String(Math.max(1, Number(withinDays) || 30)),
        withinDays: String(Math.max(1, Number(withinDays) || 30)),
      });
      const [ov, re, wa, dr] = await Promise.all([
        api(`/api/intelligence/overview?${q.toString()}`),
        api(`/api/intelligence/reorder?${q.toString()}`),
        showWaste
          ? api(`/api/intelligence/waste?${q.toString()}`)
          : Promise.resolve({ items: [], totals: null }),
        api(`/api/intelligence/drafts?branchId=${encodeURIComponent(branchId)}&status=OPEN`),
      ]);
      setOverview(ov);
      const recs = Array.isArray(re?.recommendations) ? re.recommendations : [];
      setReorder(recs);
      setSelected((prev) => {
        const next = {};
        for (const r of recs) {
          if (prev[r.productId]) next[r.productId] = true;
        }
        return next;
      });
      setQtyOverride({});
      setCostOverride({});
      setWaste(Array.isArray(wa?.items) ? wa.items : []);
      setWasteTotals(wa?.totals || null);
      setDrafts(Array.isArray(dr?.drafts) ? dr.drafts : []);
    } catch (e) {
      setErr(e.message || t("stockBrain.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [branchId, lookbackDays, targetStockDays, withinDays, showWaste, t]);

  useEffect(() => {
    loadAll().catch(() => {});
  }, [loadAll]);

  const selectedCount = useMemo(
    () => Object.values(selected).filter(Boolean).length,
    [selected],
  );

  const allSelected = reorder.length > 0 && selectedCount === reorder.length;

  const selectedLines = useMemo(() => {
    return reorder
      .filter((r) => selected[r.productId])
      .map((r) => {
        const qty = Math.max(
          1,
          Math.floor(Number(qtyOverride[r.productId] ?? r.suggestedQty) || 1),
        );
        const unitCostRaw = costOverride[r.productId];
        const unitCost =
          unitCostRaw != null && unitCostRaw !== ""
            ? Number(unitCostRaw)
            : r.defaultUnitCost != null
              ? Number(r.defaultUnitCost)
              : null;
        return {
          productId: r.productId,
          quantity: qty,
          unitCost,
          reason: `${r.severity}: stock ${r.currentQty} ≤ RP ${r.reorderPoint}; suggest ${qty}`,
          name: productDisplayName(r, locale),
        };
      });
  }, [reorder, selected, qtyOverride, costOverride, locale]);

  const missingCostCount = selectedLines.filter(
    (l) => l.unitCost == null || !Number.isFinite(l.unitCost) || l.unitCost < 0,
  ).length;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelected({});
      return;
    }
    const next = {};
    for (const r of reorder) next[r.productId] = true;
    setSelected(next);
  };

  const createDraft = async () => {
    setMsg("");
    setErr("");
    if (!branchId) {
      setErr(t("purchases.needBranch"));
      return;
    }
    if (!selectedLines.length) {
      setErr(t("purchases.needPickOneProduct"));
      return;
    }
    if (missingCostCount > 0) {
      setErr(t("stockBrain.missingCost"));
      return;
    }
    setBusy(true);
    try {
      await api("/api/intelligence/drafts", {
        method: "POST",
        body: {
          branchId,
          supplierId: supplierId || undefined,
          source: "REORDER",
          note: t("stockBrain.draftNoteDefault"),
          items: selectedLines.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
            unitCost: l.unitCost,
            reason: l.reason,
          })),
        },
      });
      setMsg(t("stockBrain.draftCreated"));
      setSelected({});
      setTab("drafts");
      await loadAll();
    } catch (e) {
      setErr(e.message || t("stockBrain.draftFailed"));
    } finally {
      setBusy(false);
    }
  };

  const convertDraft = async (draftId) => {
    if (!window.confirm(t("stockBrain.confirmConvert"))) return;
    setMsg("");
    setErr("");
    setBusy(true);
    try {
      await api(`/api/intelligence/drafts/${draftId}/convert`, {
        method: "POST",
        body: { updateProductCost: true },
      });
      setMsg(t("stockBrain.draftConverted"));
      await loadAll();
    } catch (e) {
      setErr(e.message || t("stockBrain.convertFailed"));
    } finally {
      setBusy(false);
    }
  };

  const cancelDraft = async (draftId) => {
    if (!window.confirm(t("stockBrain.confirmCancel"))) return;
    setMsg("");
    setErr("");
    setBusy(true);
    try {
      await api(`/api/intelligence/drafts/${draftId}/cancel`, { method: "POST", body: {} });
      setMsg(t("stockBrain.draftCancelled"));
      await loadAll();
    } catch (e) {
      setErr(e.message || t("stockBrain.cancelFailed"));
    } finally {
      setBusy(false);
    }
  };

  const tabs = [
    {
      id: "reorder",
      label: t("stockBrain.tabReorder"),
      count: overview?.reorder?.count ?? reorder.length,
    },
    ...(showWaste
      ? [
          {
            id: "waste",
            label: t("stockBrain.tabWaste"),
            count: overview?.waste?.count ?? waste.length,
          },
        ]
      : []),
    {
      id: "drafts",
      label: t("stockBrain.tabDrafts"),
      count: overview?.openDrafts ?? drafts.length,
    },
  ];

  if (!branchId) {
    return (
      <div style={{ display: "grid", gap: 16 }}>
        <h1 style={{ margin: 0 }}>{t("stockBrain.title")}</h1>
        <EmptyState title={t("purchases.needBranch")} />
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div>
        <h1 style={{ margin: 0 }}>{t("stockBrain.title")}</h1>
        <p style={{ margin: "6px 0 0", color: "var(--muted)" }}>{t("stockBrain.intro")}</p>
      </div>

      {overview ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 12,
          }}
        >
          <Kpi
            label={t("stockBrain.kpiReorder")}
            value={String(overview.reorder?.count ?? 0)}
            hint={t("stockBrain.kpiReorderHint", {
              critical: String(overview.reorder?.critical ?? 0),
            })}
          />
          {showWaste ? (
            <Kpi
              label={t("stockBrain.kpiWaste")}
              value={String(overview.waste?.count ?? 0)}
              hint={t("stockBrain.kpiWasteHint", {
                value: cur(overview.waste?.valueAtRisk ?? 0),
              })}
            />
          ) : null}
          <Kpi
            label={t("stockBrain.kpiDrafts")}
            value={String(overview.openDrafts ?? 0)}
            hint={t("stockBrain.kpiDraftsHint")}
          />
        </div>
      ) : null}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {tabs.map((tb) => (
          <button
            key={tb.id}
            type="button"
            className="btn-touch"
            onClick={() => setTab(tb.id)}
            style={{
              background: tab === tb.id ? "var(--accent)" : "var(--surface)",
              color: tab === tb.id ? "#fff" : "var(--text)",
              border: "1px solid var(--border)",
            }}
          >
            {tb.label}
            {tb.count != null ? (
              <span style={{ marginInlineStart: 6, opacity: 0.85 }}>({tb.count})</span>
            ) : null}
          </button>
        ))}
        <button
          type="button"
          className="btn-touch"
          onClick={() => loadAll()}
          disabled={loading || busy}
          style={{ marginInlineStart: "auto", border: "1px solid var(--border)" }}
        >
          {t("stockBrain.refresh")}
        </button>
      </div>

      {msg ? (
        <div style={{ color: "var(--success, #15803d)", fontSize: 14 }}>{msg}</div>
      ) : null}
      {err ? <div style={{ color: "#b91c1c", fontSize: 14 }}>{err}</div> : null}

      {loading ? <div style={{ color: "var(--muted)" }}>{t("common.loading")}</div> : null}

      {!loading && tab === "reorder" ? (
        <div className="card" style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "end" }}>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 13, color: "var(--muted)" }}>{t("stockBrain.lookbackLabel")}</span>
              <input
                style={{ ...inp, width: 120 }}
                type="number"
                min={7}
                max={120}
                value={lookbackDays}
                onChange={(e) => setLookbackDays(e.target.value)}
              />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 13, color: "var(--muted)" }}>{t("stockBrain.targetStockLabel")}</span>
              <input
                style={{ ...inp, width: 120 }}
                type="number"
                min={7}
                max={90}
                value={targetStockDays}
                onChange={(e) => setTargetStockDays(e.target.value)}
              />
            </label>
            <label style={{ display: "grid", gap: 4, minWidth: 180 }}>
              <span style={{ fontSize: 13, color: "var(--muted)" }}>{t("purchases.supplierOptional")}</span>
              <select style={inp} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">—</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn-touch"
              style={{ border: "1px solid var(--border)" }}
              onClick={toggleSelectAll}
              disabled={!reorder.length}
            >
              {allSelected ? t("stockBrain.clearSelection") : t("stockBrain.selectAll")}
            </button>
            <button
              type="button"
              className="btn-touch"
              style={{ background: "var(--accent)", color: "#fff" }}
              onClick={createDraft}
              disabled={busy || !selectedLines.length}
            >
              {busy ? t("common.loading") : t("stockBrain.createDraft")}
              {selectedCount ? ` (${selectedCount})` : ""}
            </button>
            <Link to="/purchases" style={{ fontSize: 13, alignSelf: "center" }}>
              {t("stockBrain.openPurchases")}
            </Link>
          </div>

          {missingCostCount > 0 && selectedCount > 0 ? (
            <div style={{ fontSize: 13, color: "#b91c1c" }}>{t("stockBrain.missingCost")}</div>
          ) : null}

          {!reorder.length ? (
            <EmptyState title={t("purchases.noReorderNeeded")} />
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 860 }}>
                <thead>
                  <tr style={{ color: "var(--muted)", textAlign: "start" }}>
                    <th style={th}>{t("purchases.colSelect")}</th>
                    <th style={th}>{t("stockBrain.colSeverity")}</th>
                    <th style={th}>{t("purchases.colProduct")}</th>
                    <th style={th}>{t("purchases.colCurrent")}</th>
                    <th style={th}>{t("purchases.colReorderPoint")}</th>
                    <th style={th}>{t("stockBrain.colDaysCover")}</th>
                    <th style={th}>{t("purchases.colSuggested")}</th>
                    <th style={th}>{t("purchases.colCost")}</th>
                  </tr>
                </thead>
                <tbody>
                  {reorder.map((r) => (
                    <tr key={r.productId}>
                      <td style={td}>
                        <input
                          type="checkbox"
                          checked={Boolean(selected[r.productId])}
                          onChange={(e) =>
                            setSelected((prev) => ({ ...prev, [r.productId]: e.target.checked }))
                          }
                        />
                      </td>
                      <td style={td}>
                        <SeverityBadge level={r.severity} t={t} />
                      </td>
                      <td style={td}>
                        <div style={{ fontWeight: 600 }}>{productDisplayName(r, locale)}</div>
                        {r.sku ? (
                          <div style={{ color: "var(--muted)", fontSize: 12 }}>{r.sku}</div>
                        ) : null}
                      </td>
                      <td style={td}>{r.currentQty}</td>
                      <td style={td}>{r.reorderPoint}</td>
                      <td style={td}>{r.daysOfCover ?? "—"}</td>
                      <td style={td}>
                        <input
                          style={{ ...inp, width: 80, padding: 8 }}
                          type="number"
                          min={1}
                          value={qtyOverride[r.productId] ?? r.suggestedQty}
                          onChange={(e) =>
                            setQtyOverride((prev) => ({ ...prev, [r.productId]: e.target.value }))
                          }
                        />
                      </td>
                      <td style={td}>
                        <input
                          style={{ ...inp, width: 90, padding: 8 }}
                          type="number"
                          min={0}
                          step="0.01"
                          placeholder={
                            r.defaultUnitCost != null ? String(r.defaultUnitCost) : t("stockBrain.costRequired")
                          }
                          value={costOverride[r.productId] ?? ""}
                          onChange={(e) =>
                            setCostOverride((prev) => ({ ...prev, [r.productId]: e.target.value }))
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {!loading && tab === "waste" && showWaste ? (
        <div className="card" style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "end" }}>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 13, color: "var(--muted)" }}>{t("stockBrain.withinDays")}</span>
              <input
                style={{ ...inp, width: 120 }}
                type="number"
                min={1}
                max={120}
                value={withinDays}
                onChange={(e) => setWithinDays(e.target.value)}
              />
            </label>
            {wasteTotals ? (
              <div style={{ fontSize: 13, color: "var(--muted)", paddingBottom: 8 }}>
                {t("stockBrain.wasteSummary", {
                  count: String(wasteTotals.count),
                  critical: String(wasteTotals.critical),
                  value: cur(wasteTotals.valueAtRisk),
                })}
              </div>
            ) : null}
            <Link to="/inventory-lots" style={{ fontSize: 13, alignSelf: "center" }}>
              {t("stockBrain.openLots")}
            </Link>
            <Link to="/pricing-brain" style={{ fontSize: 13, alignSelf: "center" }}>
              {t("nav.priceBrain")}
            </Link>
          </div>

          {!waste.length ? (
            <EmptyState title={t("stockBrain.wasteEmpty")} />
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 780 }}>
                <thead>
                  <tr style={{ color: "var(--muted)", textAlign: "start" }}>
                    <th style={th}>{t("stockBrain.colSeverity")}</th>
                    <th style={th}>{t("purchases.colProduct")}</th>
                    <th style={th}>{t("lotsBrowser.colQty")}</th>
                    <th style={th}>{t("lotsBrowser.colExpiry")}</th>
                    <th style={th}>{t("lotsBrowser.colDays")}</th>
                    <th style={th}>{t("stockBrain.colValueAtRisk")}</th>
                    <th style={th}>{t("stockBrain.colAction")}</th>
                  </tr>
                </thead>
                <tbody>
                  {waste.map((row) => (
                    <tr key={`${row.kind}-${row.lotId || row.productId}`}>
                      <td style={td}>
                        <SeverityBadge level={row.severity} t={t} />
                      </td>
                      <td style={td}>
                        <div style={{ fontWeight: 600 }}>{productDisplayName(row, locale)}</div>
                        <div style={{ color: "var(--muted)", fontSize: 12 }}>
                          {row.kind === "LOT" ? t("stockBrain.kindLot") : t("stockBrain.kindProduct")}
                          {row.sku ? ` · ${row.sku}` : ""}
                        </div>
                      </td>
                      <td style={td}>{row.quantityOnHand}</td>
                      <td style={td}>
                        {row.expiryDate
                          ? new Date(row.expiryDate).toLocaleDateString(loc)
                          : "—"}
                      </td>
                      <td style={td}>{row.daysUntilExpiry ?? "—"}</td>
                      <td style={td}>{cur(row.valueAtRisk)}</td>
                      <td style={td}>{t(`stockBrain.action.${row.actionHint}`)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {!loading && tab === "drafts" ? (
        <div className="card" style={{ display: "grid", gap: 14 }}>
          <p style={{ margin: 0, color: "var(--muted)", fontSize: 14 }}>{t("stockBrain.draftsIntro")}</p>
          {!drafts.length ? (
            <EmptyState title={t("stockBrain.draftsEmpty")} />
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {drafts.map((d) => {
                const lineCount = d.items?.length || 0;
                const est = (d.items || []).reduce((s, it) => {
                  const c = it.unitCost != null ? Number(it.unitCost) : 0;
                  return s + c * Number(it.quantity || 0);
                }, 0);
                return (
                  <div
                    key={d.id}
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: 14,
                      padding: 14,
                      display: "grid",
                      gap: 10,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 8,
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <strong>
                          {t("stockBrain.draftLabel", { id: d.id.slice(0, 8) })}
                        </strong>
                        <div style={{ fontSize: 13, color: "var(--muted)" }}>
                          {new Date(d.createdAt).toLocaleString(loc)}
                          {d.supplier?.name ? ` · ${d.supplier.name}` : ""}
                          {` · ${lineCount} ${t("stockBrain.lines")}`}
                          {est > 0 ? ` · ~${cur(est)}` : ""}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          className="btn-touch"
                          style={{ background: "var(--accent)", color: "#fff" }}
                          onClick={() => convertDraft(d.id)}
                          disabled={busy}
                        >
                          {t("stockBrain.convertDraft")}
                        </button>
                        <button
                          type="button"
                          className="btn-touch"
                          style={{ border: "1px solid var(--border)" }}
                          onClick={() => cancelDraft(d.id)}
                          disabled={busy}
                        >
                          {t("stockBrain.cancelDraft")}
                        </button>
                      </div>
                    </div>
                    <ul style={{ margin: 0, paddingInlineStart: 18, fontSize: 13 }}>
                      {(d.items || []).slice(0, 8).map((it) => (
                        <li key={it.id}>
                          {productDisplayName(it.product || { name: it.productId }, locale)} ×{" "}
                          {it.quantity}
                          {it.unitCost != null ? ` @ ${cur(Number(it.unitCost))}` : ""}
                        </li>
                      ))}
                      {lineCount > 8 ? (
                        <li style={{ color: "var(--muted)" }}>
                          {t("stockBrain.moreLines", { n: String(lineCount - 8) })}
                        </li>
                      ) : null}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function Kpi({ label, value, hint }) {
  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ fontSize: 12, color: "var(--muted)" }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.2 }}>{value}</div>
      {hint ? <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>{hint}</div> : null}
    </div>
  );
}
