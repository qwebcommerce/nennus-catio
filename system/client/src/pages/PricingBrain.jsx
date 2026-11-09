import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client.js";
import { useI18n } from "../context/LanguageContext.jsx";
import { useActiveBranchId } from "../context/BranchContext.jsx";
import { useOrgCurrency } from "../lib/orgCurrency.js";
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
      <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.2 }}>{value}</div>
      {hint ? <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>{hint}</div> : null}
    </div>
  );
}

export default function PricingBrain() {
  const { t, locale } = useI18n();
  const { format: cur } = useOrgCurrency();
  const branchId = useActiveBranchId();

  const [tab, setTab] = useState("markdowns");
  const [withinDays, setWithinDays] = useState("14");
  const [lookbackDays, setLookbackDays] = useState("30");
  const [overview, setOverview] = useState(null);
  const [markdowns, setMarkdowns] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [bundles, setBundles] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [selected, setSelected] = useState({});
  const [applyMode, setApplyMode] = useState("PRICE");
  const [simProductId, setSimProductId] = useState("");
  const [simDiscount, setSimDiscount] = useState("15");
  const [simUnits, setSimUnits] = useState("");
  const [simulation, setSimulation] = useState(null);
  const [simProduct, setSimProduct] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const loadAll = useCallback(async () => {
    if (!branchId) {
      setOverview(null);
      setMarkdowns([]);
      setRecommendations([]);
      setBundles([]);
      setDrafts([]);
      return;
    }
    setLoading(true);
    setErr("");
    try {
      const q = new URLSearchParams({
        branchId,
        withinDays: String(Math.max(1, Number(withinDays) || 14)),
        lookbackDays: String(Math.max(7, Number(lookbackDays) || 30)),
      });
      const [ov, md, rec, bun, dr] = await Promise.all([
        api(`/api/intelligence/pricing/overview?${q}`),
        api(`/api/intelligence/pricing/markdowns?${q}`),
        api(`/api/intelligence/pricing/recommendations?${q}`),
        api(`/api/intelligence/pricing/bundles?${q}`),
        api(`/api/intelligence/pricing/drafts?status=OPEN`),
      ]);
      setOverview(ov);
      setMarkdowns(Array.isArray(md?.items) ? md.items : []);
      setRecommendations(Array.isArray(rec?.items) ? rec.items : []);
      setBundles(Array.isArray(bun?.items) ? bun.items : []);
      setDrafts(Array.isArray(dr?.drafts) ? dr.drafts : []);
      setSelected({});
    } catch (e) {
      setErr(e.message || t("priceBrain.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [branchId, withinDays, lookbackDays, t]);

  useEffect(() => {
    loadAll().catch(() => {});
  }, [loadAll]);

  const selectedMarkdowns = useMemo(
    () => markdowns.filter((r) => selected[r.productId]),
    [markdowns, selected],
  );

  const createMarkdownDraft = async () => {
    setMsg("");
    setErr("");
    if (!selectedMarkdowns.length) {
      setErr(t("priceBrain.needPick"));
      return;
    }
    setBusy(true);
    try {
      await api("/api/intelligence/pricing/drafts", {
        method: "POST",
        body: {
          branchId,
          kind: "MARKDOWN",
          source: "WASTE",
          applyMode,
          title: t("priceBrain.draftTitleMarkdown"),
          note: t("priceBrain.draftNoteMarkdown"),
          items: selectedMarkdowns.map((r) => ({
            productId: r.productId,
            action: "PERCENT_OFF",
            currentPrice: r.currentPrice,
            cost: r.cost,
            suggestedPrice: r.suggestedPrice,
            discountPercent: r.discountPercent,
            reason: r.reason,
          })),
        },
      });
      setMsg(t("priceBrain.draftCreated"));
      setSelected({});
      setTab("drafts");
      await loadAll();
    } catch (e) {
      setErr(e.message || t("priceBrain.draftFailed"));
    } finally {
      setBusy(false);
    }
  };

  const createRecDraft = async (row) => {
    setMsg("");
    setErr("");
    setBusy(true);
    try {
      await api("/api/intelligence/pricing/drafts", {
        method: "POST",
        body: {
          branchId,
          kind: row.action === "RAISE" ? "PRICE_CHANGE" : "MARKDOWN",
          source: "VELOCITY",
          applyMode: "PRICE",
          title: t("priceBrain.draftTitleRec"),
          items: [
            {
              productId: row.productId,
              action: "SET_PRICE",
              currentPrice: row.currentPrice,
              cost: row.cost,
              suggestedPrice: row.suggestedPrice,
              discountPercent: row.discountPercent,
              reason: row.reason,
            },
          ],
        },
      });
      setMsg(t("priceBrain.draftCreated"));
      setTab("drafts");
      await loadAll();
    } catch (e) {
      setErr(e.message || t("priceBrain.draftFailed"));
    } finally {
      setBusy(false);
    }
  };

  const createBundleDraft = async (row) => {
    setMsg("");
    setErr("");
    setBusy(true);
    try {
      await api("/api/intelligence/pricing/drafts", {
        method: "POST",
        body: {
          branchId,
          kind: "BUNDLE",
          source: "BUNDLE",
          applyMode: "COUPON",
          title: t("priceBrain.draftTitleBundle"),
          note: row.reason,
          items: [
            {
              productId: row.productId,
              pairedProductId: row.pairedProductId,
              action: "BUNDLE",
              currentPrice: row.price,
              suggestedPrice: row.promoPairPrice,
              discountPercent: row.bundleDiscountPercent,
              buyQty: row.buyQty,
              freeQty: row.freeQty,
              reason: row.reason,
            },
          ],
        },
      });
      setMsg(t("priceBrain.draftCreated"));
      setTab("drafts");
      await loadAll();
    } catch (e) {
      setErr(e.message || t("priceBrain.draftFailed"));
    } finally {
      setBusy(false);
    }
  };

  const applyDraft = async (id, mode) => {
    if (!window.confirm(t("priceBrain.confirmApply"))) return;
    setBusy(true);
    setMsg("");
    setErr("");
    try {
      await api(`/api/intelligence/pricing/drafts/${id}/apply`, {
        method: "POST",
        body: { applyMode: mode },
      });
      setMsg(t("priceBrain.draftApplied"));
      await loadAll();
    } catch (e) {
      setErr(e.message || t("priceBrain.applyFailed"));
    } finally {
      setBusy(false);
    }
  };

  const cancelDraft = async (id) => {
    if (!window.confirm(t("priceBrain.confirmCancel"))) return;
    setBusy(true);
    setMsg("");
    setErr("");
    try {
      await api(`/api/intelligence/pricing/drafts/${id}/cancel`, {
        method: "POST",
        body: {},
      });
      setMsg(t("priceBrain.draftCancelled"));
      await loadAll();
    } catch (e) {
      setErr(e.message || t("priceBrain.cancelFailed"));
    } finally {
      setBusy(false);
    }
  };

  const runSimulate = async () => {
    setMsg("");
    setErr("");
    setBusy(true);
    try {
      const body = {
        branchId,
        discountPercent: Number(simDiscount) || 0,
      };
      if (simProductId) body.productId = simProductId;
      if (simUnits !== "") body.estimatedUnits = Number(simUnits);
      const res = await api("/api/intelligence/pricing/simulate", {
        method: "POST",
        body,
      });
      setSimulation(res.simulation || null);
      setSimProduct(res.product || null);
    } catch (e) {
      setErr(e.message || t("priceBrain.simFailed"));
      setSimulation(null);
    } finally {
      setBusy(false);
    }
  };

  const productOptions = useMemo(() => {
    const map = new Map();
    for (const r of [...markdowns, ...recommendations]) {
      map.set(r.productId, r);
    }
    return [...map.values()];
  }, [markdowns, recommendations]);

  const tabs = [
    { id: "markdowns", label: t("priceBrain.tabMarkdowns"), count: overview?.markdowns?.count },
    {
      id: "recommendations",
      label: t("priceBrain.tabRecommendations"),
      count: overview?.recommendations?.count,
    },
    { id: "simulator", label: t("priceBrain.tabSimulator") },
    { id: "bundles", label: t("priceBrain.tabBundles"), count: overview?.bundles?.count },
    { id: "drafts", label: t("priceBrain.tabDrafts"), count: overview?.openDrafts },
  ];

  if (!branchId) {
    return (
      <div style={{ display: "grid", gap: 16 }}>
        <h1 style={{ margin: 0 }}>{t("priceBrain.title")}</h1>
        <EmptyState title={t("purchases.needBranch")} />
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div>
        <h1 style={{ margin: 0 }}>{t("priceBrain.title")}</h1>
        <p style={{ margin: "6px 0 0", color: "var(--muted)" }}>{t("priceBrain.intro")}</p>
      </div>

      {overview ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: 12,
          }}
        >
          <Kpi
            label={t("priceBrain.kpiMarkdowns")}
            value={String(overview.markdowns?.count ?? 0)}
            hint={t("priceBrain.kpiMarkdownsHint")}
          />
          <Kpi
            label={t("priceBrain.kpiRecs")}
            value={String(overview.recommendations?.count ?? 0)}
            hint={t("priceBrain.kpiRecsHint", {
              down: String(overview.recommendations?.markdowns ?? 0),
              up: String(overview.recommendations?.raises ?? 0),
            })}
          />
          <Kpi
            label={t("priceBrain.kpiBundles")}
            value={String(overview.bundles?.count ?? 0)}
            hint={t("priceBrain.kpiBundlesHint")}
          />
          <Kpi
            label={t("priceBrain.kpiDrafts")}
            value={String(overview.openDrafts ?? 0)}
            hint={t("priceBrain.kpiDraftsHint")}
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
          {t("priceBrain.refresh")}
        </button>
      </div>

      {msg ? <div style={{ color: "var(--success, #15803d)", fontSize: 14 }}>{msg}</div> : null}
      {err ? <div style={{ color: "#b91c1c", fontSize: 14 }}>{err}</div> : null}
      {loading ? <div style={{ color: "var(--muted)" }}>{t("common.loading")}</div> : null}

      {!loading && tab === "markdowns" ? (
        <div className="card" style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "end" }}>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 13, color: "var(--muted)" }}>{t("priceBrain.withinDays")}</span>
              <input
                style={{ ...inp, width: 110 }}
                type="number"
                min={1}
                max={60}
                value={withinDays}
                onChange={(e) => setWithinDays(e.target.value)}
              />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 13, color: "var(--muted)" }}>{t("priceBrain.applyMode")}</span>
              <select style={inp} value={applyMode} onChange={(e) => setApplyMode(e.target.value)}>
                <option value="PRICE">{t("priceBrain.applyPrice")}</option>
                <option value="COUPON">{t("priceBrain.applyCoupon")}</option>
              </select>
            </label>
            <button
              type="button"
              className="btn-touch"
              style={{ background: "var(--accent)", color: "#fff" }}
              disabled={busy || !selectedMarkdowns.length}
              onClick={createMarkdownDraft}
            >
              {t("priceBrain.createDraft")} ({selectedMarkdowns.length})
            </button>
            <Link to="/stock-brain" style={{ fontSize: 13, alignSelf: "center" }}>
              {t("priceBrain.openWaste")}
            </Link>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>
            {t("priceBrain.markdownIntro")}
          </p>
          {!markdowns.length ? (
            <EmptyState title={t("priceBrain.markdownEmpty")} />
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 900 }}>
                <thead>
                  <tr style={{ color: "var(--muted)", textAlign: "start" }}>
                    <th style={th}>{t("purchases.colSelect")}</th>
                    <th style={th}>{t("purchases.colProduct")}</th>
                    <th style={th}>{t("priceBrain.colDays")}</th>
                    <th style={th}>{t("priceBrain.colPrice")}</th>
                    <th style={th}>{t("priceBrain.colCost")}</th>
                    <th style={th}>{t("priceBrain.colOff")}</th>
                    <th style={th}>{t("priceBrain.colSuggested")}</th>
                    <th style={th}>{t("priceBrain.colMargin")}</th>
                  </tr>
                </thead>
                <tbody>
                  {markdowns.map((r) => (
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
                        <div style={{ fontWeight: 600 }}>{productDisplayName(r, locale)}</div>
                        {r.sku ? <div style={{ color: "var(--muted)", fontSize: 12 }}>{r.sku}</div> : null}
                      </td>
                      <td style={td}>{r.daysUntilExpiry ?? "—"}</td>
                      <td style={td}>{cur(r.currentPrice)}</td>
                      <td style={td}>{cur(r.cost)}</td>
                      <td style={td}>{r.discountPercent}%</td>
                      <td style={td}>{cur(r.suggestedPrice)}</td>
                      <td style={td}>{cur(r.marginAfter)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {!loading && tab === "recommendations" ? (
        <div className="card" style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "end" }}>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 13, color: "var(--muted)" }}>{t("priceBrain.lookback")}</span>
              <input
                style={{ ...inp, width: 110 }}
                type="number"
                min={7}
                max={120}
                value={lookbackDays}
                onChange={(e) => setLookbackDays(e.target.value)}
              />
            </label>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>{t("priceBrain.recsIntro")}</p>
          {!recommendations.length ? (
            <EmptyState title={t("priceBrain.recsEmpty")} />
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 880 }}>
                <thead>
                  <tr style={{ color: "var(--muted)", textAlign: "start" }}>
                    <th style={th}>{t("purchases.colProduct")}</th>
                    <th style={th}>{t("priceBrain.colAction")}</th>
                    <th style={th}>{t("priceBrain.colCover")}</th>
                    <th style={th}>{t("priceBrain.colPrice")}</th>
                    <th style={th}>{t("priceBrain.colSuggested")}</th>
                    <th style={th}>{t("priceBrain.colReason")}</th>
                    <th style={th} />
                  </tr>
                </thead>
                <tbody>
                  {recommendations.map((r) => (
                    <tr key={r.productId}>
                      <td style={td}>
                        <div style={{ fontWeight: 600 }}>{productDisplayName(r, locale)}</div>
                      </td>
                      <td style={td}>
                        {r.action === "RAISE" ? t("priceBrain.actionRaise") : t("priceBrain.actionMarkdown")}
                      </td>
                      <td style={td}>{r.daysOfCover}</td>
                      <td style={td}>{cur(r.currentPrice)}</td>
                      <td style={td}>{cur(r.suggestedPrice)}</td>
                      <td style={td}>{r.reason}</td>
                      <td style={td}>
                        <button
                          type="button"
                          className="btn-touch"
                          style={{ background: "var(--accent)", color: "#fff" }}
                          disabled={busy}
                          onClick={() => createRecDraft(r)}
                        >
                          {t("priceBrain.addDraft")}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {!loading && tab === "simulator" ? (
        <div className="card" style={{ display: "grid", gap: 14, maxWidth: 640 }}>
          <p style={{ margin: 0, color: "var(--muted)", fontSize: 14 }}>{t("priceBrain.simIntro")}</p>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>{t("purchases.colProduct")}</span>
            <select
              style={inp}
              value={simProductId}
              onChange={(e) => setSimProductId(e.target.value)}
            >
              <option value="">—</option>
              {productOptions.map((p) => (
                <option key={p.productId} value={p.productId}>
                  {productDisplayName(p, locale)}
                </option>
              ))}
            </select>
          </label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 13, color: "var(--muted)" }}>{t("priceBrain.colOff")}</span>
              <input
                style={{ ...inp, width: 120 }}
                type="number"
                min={0}
                max={90}
                value={simDiscount}
                onChange={(e) => setSimDiscount(e.target.value)}
              />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 13, color: "var(--muted)" }}>{t("priceBrain.simUnits")}</span>
              <input
                style={{ ...inp, width: 140 }}
                type="number"
                min={0}
                placeholder={t("priceBrain.simUnitsAuto")}
                value={simUnits}
                onChange={(e) => setSimUnits(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="btn-touch"
              style={{ background: "var(--accent)", color: "#fff", alignSelf: "end" }}
              disabled={busy || !simProductId}
              onClick={runSimulate}
            >
              {t("priceBrain.runSim")}
            </button>
          </div>
          {simulation ? (
            <div style={{ display: "grid", gap: 8, fontSize: 14 }}>
              {simProduct ? (
                <strong>{productDisplayName(simProduct, locale)}</strong>
              ) : null}
              <div>
                {t("priceBrain.simPrice")}: {cur(simulation.price)} → {cur(simulation.newPrice)}
              </div>
              <div>
                {t("priceBrain.simMarginPct")}: {simulation.marginPctBefore}% →{" "}
                {simulation.marginPctAfter}%
              </div>
              <div>
                {t("priceBrain.simUnitsLabel")}: {simulation.estimatedUnits} →{" "}
                {simulation.estimatedUnitsAfter}
              </div>
              <div>
                {t("priceBrain.simProfit")}: {cur(simulation.profitBefore)} →{" "}
                {cur(simulation.profitAfter)}{" "}
                <span style={{ color: simulation.profitDelta >= 0 ? "#15803d" : "#b91c1c" }}>
                  ({simulation.profitDelta >= 0 ? "+" : ""}
                  {cur(simulation.profitDelta)})
                </span>
              </div>
              {simulation.belowCost ? (
                <div style={{ color: "#b91c1c" }}>{t("priceBrain.simBelowCost")}</div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {!loading && tab === "bundles" ? (
        <div className="card" style={{ display: "grid", gap: 14 }}>
          <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>{t("priceBrain.bundlesIntro")}</p>
          {!bundles.length ? (
            <EmptyState title={t("priceBrain.bundlesEmpty")} />
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {bundles.map((b) => (
                <div
                  key={`${b.productId}-${b.pairedProductId}`}
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: 14,
                    padding: 14,
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 12,
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <strong>
                      {productDisplayName(b, locale)} +{" "}
                      {productDisplayName(
                        { name: b.pairedName, nameEn: b.pairedNameEn },
                        locale,
                      )}
                    </strong>
                    <div style={{ fontSize: 13, color: "var(--muted)" }}>
                      {t("priceBrain.together", { n: String(b.togetherCount) })} ·{" "}
                      {b.bundleDiscountPercent}% · {cur(b.pairPrice)} → {cur(b.promoPairPrice)}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn-touch"
                    style={{ background: "var(--accent)", color: "#fff" }}
                    disabled={busy}
                    onClick={() => createBundleDraft(b)}
                  >
                    {t("priceBrain.addDraft")}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {!loading && tab === "drafts" ? (
        <div className="card" style={{ display: "grid", gap: 14 }}>
          <p style={{ margin: 0, fontSize: 14, color: "var(--muted)" }}>{t("priceBrain.draftsIntro")}</p>
          {!drafts.length ? (
            <EmptyState title={t("priceBrain.draftsEmpty")} />
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {drafts.map((d) => (
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
                        {d.title || t("priceBrain.draftLabel", { id: d.id.slice(0, 8) })}
                      </strong>
                      <div style={{ fontSize: 13, color: "var(--muted)" }}>
                        {d.kind} · {d.source} · {d.applyMode} · {(d.items || []).length}{" "}
                        {t("priceBrain.lines")}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className="btn-touch"
                        style={{ background: "var(--accent)", color: "#fff" }}
                        disabled={busy}
                        onClick={() => applyDraft(d.id, d.applyMode || "PRICE")}
                      >
                        {t("priceBrain.applyDraft")}
                      </button>
                      <button
                        type="button"
                        className="btn-touch"
                        style={{ border: "1px solid var(--border)" }}
                        disabled={busy}
                        onClick={() => cancelDraft(d.id)}
                      >
                        {t("priceBrain.cancelDraft")}
                      </button>
                    </div>
                  </div>
                  <ul style={{ margin: 0, paddingInlineStart: 18, fontSize: 13 }}>
                    {(d.items || []).slice(0, 6).map((it) => (
                      <li key={it.id}>
                        {productDisplayName(it.product || { name: it.productId }, locale)}
                        {it.discountPercent != null ? ` · ${Number(it.discountPercent)}%` : ""}
                        {it.suggestedPrice != null
                          ? ` → ${cur(Number(it.suggestedPrice))}`
                          : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
          <Link to="/loyalty" style={{ fontSize: 13 }}>
            {t("priceBrain.openCoupons")}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
